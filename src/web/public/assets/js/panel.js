/* global Tabulator */
(function() {
	const pollIntervalMs = 15000;

	function replaceFeather() {
		if (window.feather && typeof window.feather.replace === 'function') {
			window.feather.replace({ width: '16px', height: '16px' });
		}
	}

	function configureToastr() {
		if (!window.toastr) return;

		window.toastr.options = {
			closeButton: true,
			progressBar: true,
			positionClass: 'toast-top-right',
			timeOut: 3500,
			extendedTimeOut: 1500,
			preventDuplicates: true,
		};
	}

	function notify(type, message, title) {
		if (!message) return;
		if (window.toastr && typeof window.toastr[type] === 'function') {
			window.toastr[type](message, title || '');
			return;
		}
		console[type === 'error' ? 'error' : 'log'](message);
	}

	function isFormData(body) {
		return typeof FormData !== 'undefined' && body instanceof FormData;
	}

	function encodeBody(body) {
		if (!body || typeof body === 'string' || isFormData(body)) {
			return body;
		}
		return new URLSearchParams(body);
	}

	async function requestJson(url, options) {
		const requestOptions = options || {};
		const headers = Object.assign({
			Accept: 'application/json',
			'X-Requested-With': 'XMLHttpRequest',
		}, requestOptions.headers || {});
		const body = encodeBody(requestOptions.body);

		if (body && !isFormData(body) && !headers['Content-Type']) {
			headers['Content-Type'] = 'application/x-www-form-urlencoded;charset=UTF-8';
		}

		const response = await fetch(url, Object.assign({}, requestOptions, { headers: headers, body: body }));
		const contentType = response.headers.get('content-type') || '';
		const data = contentType.includes('application/json') ? await response.json() : {};
		if (!response.ok) {
			const error = new Error(data.message || data.error || 'Request failed');
			error.response = response;
			error.data = data;
			throw error;
		}
		return data;
	}

	function applyTableSearch(table, search, fields) {
		if (!table) return;
		const searchValue = String(search || '').toLowerCase();
		if (!searchValue) {
			table.clearFilter();
			return;
		}
		table.setFilter(function(data) {
			return fields.some(function(field) {
				const value = data[field];
				return value != null && String(value).toLowerCase().includes(searchValue);
			});
		});
	}

	function createPollingTable(options) {
		return {
			table: null,
			search: '',
			isLoading: false,
			isRefreshing: false,
			pollTimer: null,
			modalOpen: false,

			initTable: function() {
				const self = this;
				this.table = new Tabulator(options.selector, Object.assign({}, options.tabulator, {
					ajaxURL: undefined,
					data: [],
				}));
				this.table.element.__panelComponent = this;
				this.refresh({ silent: true });
				this.pollTimer = window.setInterval(function() {
					self.refresh({ silent: true, poll: true });
				}, options.interval || pollIntervalMs);
			},

			destroy: function() {
				if (this.pollTimer) {
					window.clearInterval(this.pollTimer);
					this.pollTimer = null;
				}
			},

			refresh: async function(refreshOptions) {
				const settings = refreshOptions || {};
				if (this.isRefreshing || (settings.poll && this.modalOpen)) return;
				this.isRefreshing = true;
				this.isLoading = true;
				try {
					const response = await requestJson(options.url);
					const rows = options.rows(response);
					this.table.replaceData(rows);
					this.applySearch();
				}
				catch (error) {
					if (!settings.silent) {
						notify('error', error.message);
					}
				}
				finally {
					this.isLoading = false;
					this.isRefreshing = false;
				}
			},

			applySearch: function() {
				applyTableSearch(this.table, this.search, options.searchFields);
			},
		};
	}

	function closeBootstrapModal(selector) {
		const element = document.querySelector(selector);
		if (!element || !window.bootstrap) return;
		const modal = window.bootstrap.Modal.getInstance(element);
		if (modal) modal.hide();
	}

	function showBootstrapModal(selector) {
		const element = document.querySelector(selector);
		if (!element || !window.bootstrap) return;
		window.bootstrap.Modal.getOrCreateInstance(element).show();
	}

	function syncModalClosed(panel, selectors) {
		selectors.forEach(function(selector) {
			const element = document.querySelector(selector);
			if (!element) return;
			element.addEventListener('hidden.bs.modal', function() {
				panel.modalOpen = false;
			});
		});
	}

	function bindLogoutForm() {
		const logoutLink = document.querySelector('.logout-link');
		const logoutForm = document.getElementById('logout-form');
		if (!logoutLink || !logoutForm) return;
		logoutLink.addEventListener('click', function(event) {
			event.preventDefault();
			logoutForm.submit();
		});
	}

	function registerAlpineComponents() {
		if (!window.Alpine) return;

		window.Alpine.data('commandsPanel', function(config) {
			return Object.assign(createPollingTable({
				selector: '#commandsTable',
				url: '/commands/list',
				searchFields: ['name', 'content', 'usage', 'created_by_username', 'updated_by_username', 'created_at', 'updated_at'],
				rows: function(response) {
					if (!Array.isArray(response.commands)) return [];
					const seen = new Set();
					return response.commands.filter(function(command) {
						if (seen.has(command.id)) return false;
						seen.add(command.id);
						return true;
					});
				},
				tabulator: {
					pagination: 'local',
					paginationSize: 10,
					layout: 'fitColumns',
					initialSort: [{ column: 'name', dir: 'asc' }],
					columns: [
						{ title: 'Name', field: 'name' },
						{ title: 'Content', field: 'content' },
						{ title: 'Usage', field: 'usage' },
						{ title: 'Created By', field: 'created_by_username' },
						{ title: 'Updated By', field: 'updated_by_username' },
						{ title: 'Created At', field: 'created_at', formatter: function(cell) { return formatUnixTimestamp(cell.getValue()); } },
						{ title: 'Updated At', field: 'updated_at', formatter: function(cell) { return formatUnixTimestamp(cell.getValue()); } },
						{
							title: 'Actions',
							field: 'id',
							hozAlign: 'center',
							formatter: function(cell) {
								if (!config.canEdit) return '';
								return '<button class="btn btn-sm btn-primary editButton" data-id="' + cell.getValue() + '">Edit</button> ' +
                  '<button class="btn btn-sm btn-danger deleteButton" data-id="' + cell.getValue() + '">Delete</button>';
							},
							cellClick: function(event, cell) {
								const panel = cell.getTable().element.__panelComponent;
								const rowData = cell.getRow().getData();
								if (event.target.classList.contains('editButton')) {
									panel.openEdit(rowData);
								}
								if (event.target.classList.contains('deleteButton')) {
									panel.deleteCommand(rowData.id);
								}
							},
						},
					],
				},
			}), {
				csrfToken: config.csrfToken,
				edit: { id: '', name: '', content: '' },
				add: { name: '', content: '' },

				init: function() {
					this.initTable();
					syncModalClosed(this, ['#editModal', '#addModal']);
				},

				openEdit: function(command) {
					this.edit = { id: command.id, name: command.name || '', content: command.content || '' };
					this.modalOpen = true;
					showBootstrapModal('#editModal');
				},

				openAdd: function() {
					this.add = { name: '', content: '' };
					this.modalOpen = true;
					showBootstrapModal('#addModal');
				},

				saveEdit: async function() {
					try {
						const response = await requestJson('/commands/edit/' + encodeURIComponent(this.edit.id), {
							method: 'POST',
							body: { name: this.edit.name, content: this.edit.content, _csrf: this.csrfToken },
						});
						closeBootstrapModal('#editModal');
						this.modalOpen = false;
						notify('success', response.message || 'Command updated');
						await this.refresh({ silent: false });
					}
					catch (error) {
						notify('error', error.message);
					}
				},

				addCommand: async function() {
					try {
						const response = await requestJson('/commands/add', {
							method: 'POST',
							body: { name: this.add.name, content: this.add.content, _csrf: this.csrfToken },
						});
						closeBootstrapModal('#addModal');
						this.modalOpen = false;
						notify('success', response.message || 'Command created');
						await this.refresh({ silent: false });
					}
					catch (error) {
						notify('error', error.message);
					}
				},

				deleteCommand: async function(id) {
					if (!window.confirm('Are you sure you want to delete this command?')) return;
					try {
						const response = await requestJson('/commands/delete/' + encodeURIComponent(id), {
							method: 'POST',
							body: { _csrf: this.csrfToken },
						});
						notify('success', response.message || 'Command deleted');
						await this.refresh({ silent: false });
					}
					catch (error) {
						notify('error', error.message);
					}
				},
			});
		});

		window.Alpine.data('slashCommandsPanel', function() {
			return Object.assign(createPollingTable({
				selector: '#slashCommandsTable',
				url: '/commands/slashes/list',
				searchFields: ['name', 'description'],
				rows: function(response) { return Array.isArray(response.commands) ? response.commands : []; },
				tabulator: {
					pagination: 'local',
					paginationSize: 10,
					layout: 'fitColumns',
					initialSort: [{ column: 'name', dir: 'asc' }],
					columns: [
						{ title: 'Name', field: 'name' },
						{ title: 'Description', field: 'description' },
					],
				},
			}), {
				init: function() {
					this.initTable();
					syncModalClosed(this, ['#editModal', '#fullReasonModal']);
				},
			});
		});

		window.Alpine.data('warningsPanel', function(config) {
			return Object.assign(createPollingTable({
				selector: '#warningTable',
				url: '/warnings/list',
				searchFields: ['warn_id', 'warn_user_id', 'warn_user', 'warn_by_id', 'warn_by_user', 'warn_reason', 'created_at', 'updated_at'],
				rows: function(response) { return Array.isArray(response.warnings) ? response.warnings : []; },
				tabulator: {
					pagination: 'local',
					paginationSize: 10,
					layout: 'fitColumns',
					columns: [
						{ title: 'Warn ID', field: 'warn_id' },
						{ title: 'Warned UID', field: 'warn_user_id' },
						{ title: 'Warned User', field: 'warn_user' },
						{ title: 'Warned By UID', field: 'warn_by_id' },
						{ title: 'Warned By', field: 'warn_by_user' },
						{
							title: 'Reason',
							field: 'warn_reason',
							hozAlign: 'center',
							formatter: function() {
								return '<button type="button" class="btn btn-sm btn-info viewReasonButton">View</button>';
							},
							cellClick: function(event, cell) {
								if (!event.target.classList.contains('viewReasonButton')) return;
								const panel = cell.getTable().element.__panelComponent;
								panel.openReason(cell.getValue());
							},
						},
						{ title: 'Created At', field: 'created_at' },
						{ title: 'Updated At', field: 'updated_at' },
						{
							title: 'Actions',
							field: 'warn_id',
							hozAlign: 'center',
							formatter: function(cell) {
								if (!config.canEdit) return '';
								return '<button type="button" class="btn btn-sm btn-primary editButton" data-id="' + cell.getValue() + '">Edit</button> ' +
                  '<button type="button" class="btn btn-sm btn-danger deleteButton" data-id="' + cell.getValue() + '">Delete</button>';
							},
							cellClick: function(event, cell) {
								const panel = cell.getTable().element.__panelComponent;
								const rowData = cell.getRow().getData();
								if (event.target.classList.contains('editButton')) {
									panel.openEdit(rowData);
								}
								if (event.target.classList.contains('deleteButton')) {
									panel.deleteWarning(rowData.warn_id);
								}
							},
						},
					],
				},
			}), {
				csrfToken: config.csrfToken,
				edit: { id: '', reason: '', userId: '', username: '' },
				reason: '',

				init: function() {
					this.initTable();
				},

				openReason: function(reason) {
					this.reason = reason || '';
					this.modalOpen = true;
					showBootstrapModal('#fullReasonModal');
				},

				openEdit: function(warning) {
					this.edit = {
						id: warning.warn_id,
						reason: warning.warn_reason || '',
						userId: warning.warn_user_id || '',
						username: warning.warn_user || '',
					};
					this.modalOpen = true;
					showBootstrapModal('#editModal');
				},

				saveEdit: async function() {
					try {
						const response = await requestJson('/warnings/edit/' + encodeURIComponent(this.edit.id), {
							method: 'POST',
							body: { reason: this.edit.reason, _csrf: this.csrfToken },
						});
						closeBootstrapModal('#editModal');
						this.modalOpen = false;
						notify('success', response.message || 'Warning updated');
						await this.refresh({ silent: false });
					}
					catch (error) {
						notify('error', error.message);
					}
				},

				deleteWarning: async function(id) {
					if (!window.confirm('Are you sure you want to delete this warning?')) return;
					try {
						const response = await requestJson('/warnings/delete/' + encodeURIComponent(id), {
							method: 'POST',
							body: { warn_id: id, _csrf: this.csrfToken },
						});
						notify('success', response.message || 'Warning deleted');
						await this.refresh({ silent: false });
					}
					catch (error) {
						notify('error', error.message);
					}
				},
			});
		});

		window.Alpine.data('scamScanRulesPanel', function(config) {
			return {
				csrfToken: config.csrfToken,
				rules: config.rulesText || '',
				ruleCount: Number(config.ruleCount || 0),
				testText: config.testText || '',
				testMatches: config.testMatches || null,
				isSaving: false,
				isTesting: false,

				init: function() {
					if (config.success) notify('success', config.success);
					(config.errors || []).forEach(function(error) { notify('error', error); });
				},

				saveRules: async function() {
					this.isSaving = true;
					try {
						const response = await requestJson('/scam-scan-rules/save', {
							method: 'POST',
							body: { rules: this.rules, _csrf: this.csrfToken },
						});
						this.rules = response.rulesText || this.rules;
						this.ruleCount = Number(response.ruleCount || 0);
						notify('success', response.message || 'Saved scam scan rules.');
					}
					catch (error) {
						(error.data && error.data.errors ? error.data.errors : [error.message]).forEach(function(message) {
							notify('error', message);
						});
					}
					finally {
						this.isSaving = false;
					}
				},

				testRules: async function() {
					this.isTesting = true;
					try {
						const response = await requestJson('/scam-scan-rules/test', {
							method: 'POST',
							body: { test_text: this.testText, _csrf: this.csrfToken },
						});
						this.testMatches = response.testMatches || { matches: [] };
						notify('info', 'Rule test complete.');
					}
					catch (error) {
						notify('error', error.message);
					}
					finally {
						this.isTesting = false;
					}
				},
			};
		});

		window.Alpine.data('starboardMessagesPanel', function(config) {
			return Object.assign(createPollingTable({
				selector: '#starboardMessagesTable',
				url: '/starboard-messages/list',
				searchFields: [
					'id',
					'star_count',
					'source_channel_name',
					'source_channel_id',
					'source_message_id',
					'starboard_message_id',
					'created_at',
					'updated_at',
				],
				rows: function(response) { return Array.isArray(response.entries) ? response.entries : []; },
				tabulator: {
					pagination: 'local',
					paginationSize: 15,
					layout: 'fitColumns',
					initialSort: [{ column: 'created_at', dir: 'desc' }],
					columns: [
						{ title: 'Stars', field: 'star_count', width: 80 },
						{ title: 'Source channel', field: 'source_channel_name' },
						{
							title: 'Original',
							field: 'source_message_url',
							formatter: function(cell) {
								const url = cell.getValue();
								return url ? '<a href="' + url + '" target="_blank" rel="noopener noreferrer">Jump</a>' : '—';
							},
						},
						{
							title: 'Starboard post',
							field: 'starboard_message_url',
							formatter: function(cell) {
								const url = cell.getValue();
								return url ? '<a href="' + url + '" target="_blank" rel="noopener noreferrer">View</a>' : '—';
							},
						},
						{ title: 'Posted', field: 'created_at' },
						{
							title: 'Actions',
							field: 'id',
							hozAlign: 'center',
							width: 120,
							formatter: function(cell) {
								return '<button type="button" class="btn btn-sm btn-danger deleteButton" data-id="' + cell.getValue() + '">Remove</button>';
							},
							cellClick: function(event, cell) {
								if (!event.target.classList.contains('deleteButton')) return;
								const panel = cell.getTable().element.__panelComponent;
								panel.removeEntry(cell.getValue());
							},
						},
					],
				},
			}), {
				csrfToken: config.csrfToken,
				starboardChannelId: config.starboardChannelId || '',

				init: function() {
					this.initTable();
				},

				removeEntry: async function(id) {
					if (!window.confirm('Remove this message from the starboard channel?')) return;
					try {
						const response = await requestJson('/starboard-messages/delete/' + encodeURIComponent(id), {
							method: 'POST',
							body: { _csrf: this.csrfToken },
						});
						notify('success', response.message || 'Starboard message removed.');
						await this.refresh({ silent: false });
					}
					catch (error) {
						notify('error', error.message);
					}
				},
			});
		});

		window.Alpine.data('starboardSettingsPanel', function(config) {
			return {
				csrfToken: config.csrfToken,
				settings: Object.assign({ allowedRoleIds: [], adminRoleIds: [] }, config.settings || {}),
				guildRoles: config.guildRoles || [],
				textChannels: config.textChannels || [],
				thresholdMin: config.thresholdMin || 1,
				thresholdMax: config.thresholdMax || 50,
				isSaving: false,

				init: function() {
					if (!Array.isArray(this.settings.allowedRoleIds)) {
						this.settings.allowedRoleIds = [];
					}
					if (!Array.isArray(this.settings.adminRoleIds)) {
						this.settings.adminRoleIds = [];
					}
					this.settings.channelId = this.settings.channelId ? String(this.settings.channelId) : '';
					if (config.success) notify('success', config.success);
					(config.errors || []).forEach(function(error) { notify('error', error); });
				},

				toggleRole: function(roleId, checked) {
					const ids = this.settings.allowedRoleIds.slice();
					const index = ids.indexOf(roleId);
					if (checked && index === -1) ids.push(roleId);
					if (!checked && index !== -1) ids.splice(index, 1);
					this.settings.allowedRoleIds = ids;
				},

				toggleAdminRole: function(roleId, checked) {
					const ids = this.settings.adminRoleIds.slice();
					const index = ids.indexOf(roleId);
					if (checked && index === -1) ids.push(roleId);
					if (!checked && index !== -1) ids.splice(index, 1);
					this.settings.adminRoleIds = ids;
				},

				saveSettings: async function() {
					this.isSaving = true;
					try {
						const body = {
							enabled: this.settings.enabled ? 'on' : '',
							channelId: this.settings.channelId || '',
							emoji: this.settings.emoji || '',
							threshold: String(this.settings.threshold || ''),
							allowedRoleIds: this.settings.allowedRoleIds.join(','),
							adminRoleIds: this.settings.adminRoleIds.join(','),
							_csrf: this.csrfToken,
						};
						const response = await requestJson('/starboard-settings/save', {
							method: 'POST',
							body: body,
						});
						this.settings = Object.assign({ allowedRoleIds: [], adminRoleIds: [] }, response.settings || this.settings);
						if (!Array.isArray(this.settings.allowedRoleIds)) {
							this.settings.allowedRoleIds = [];
						}
						if (!Array.isArray(this.settings.adminRoleIds)) {
							this.settings.adminRoleIds = [];
						}
						this.settings.channelId = this.settings.channelId ? String(this.settings.channelId) : '';
						notify('success', response.message || 'Saved starboard settings.');
					}
					catch (error) {
						(error.data && error.data.errors ? error.data.errors : [error.message]).forEach(function(message) {
							notify('error', message);
						});
						if (error.data && error.data.settings) {
							this.settings = Object.assign({ allowedRoleIds: [], adminRoleIds: [] }, error.data.settings);
						}
					}
					finally {
						this.isSaving = false;
					}
				},
			};
		});

		window.Alpine.data('scamScanSettingsPanel', function(config) {
			return {
				csrfToken: config.csrfToken,
				settings: Object.assign({}, config.settings || {}),
				isSaving: false,

				init: function() {
					if (config.success) notify('success', config.success);
					(config.errors || []).forEach(function(error) { notify('error', error); });
				},

				saveSettings: async function() {
					this.isSaving = true;
					try {
						const body = Object.assign({}, this.settings, { _csrf: this.csrfToken });
						const response = await requestJson('/scam-scan-settings/save', {
							method: 'POST',
							body: body,
						});
						this.settings = Object.assign({}, response.settings || this.settings);
						notify('success', response.message || 'Saved scam scan settings.');
					}
					catch (error) {
						(error.data && error.data.errors ? error.data.errors : [error.message]).forEach(function(message) {
							notify('error', message);
						});
						if (error.data && error.data.settings) {
							this.settings = Object.assign({}, error.data.settings);
						}
					}
					finally {
						this.isSaving = false;
					}
				},
			};
		});

		window.Alpine.data('scamScanHistoryPanel', function(config) {
			function initialFilters(filters) {
				const source = filters || {};
				return {
					range: source.range || '24h',
					status: source.status || '',
					reasonCode: source.reasonCode || '',
					failureStage: source.failureStage || '',
					manualReviewQueued: source.manualReviewQueued == null ? '' : String(source.manualReviewQueued),
					page: Number(source.page || 1),
				};
			}

			return {
				filters: initialFilters(config.filters),
				metrics: config.metrics || {},
				ruleHits: config.ruleHits || [],
				scans: config.scans || [],
				page: config.page || { page: 1, limit: 25, hasMore: false },
				ocrPreview: { title: 'OCR preview', text: '' },
				isLoading: false,
				isRefreshing: false,
				pollTimer: null,

				init: function() {
					const self = this;
					this.pollTimer = window.setInterval(function() {
						self.refresh({ silent: true });
					}, pollIntervalMs);
				},

				destroy: function() {
					if (this.pollTimer) {
						window.clearInterval(this.pollTimer);
						this.pollTimer = null;
					}
				},

				metricCards: function() {
					const byStatus = this.metrics.byStatus || {};
					const averages = this.metrics.averages || {};
					return [
						{ label: 'Total scans', value: this.valueOrDash(this.metrics.total) },
						{ label: 'Hits', value: this.valueOrDash(byStatus.hit) },
						{ label: 'Clean', value: this.valueOrDash(byStatus.clean) },
						{ label: 'Timeouts', value: this.valueOrDash(byStatus.timeout) },
						{ label: 'Failed', value: this.valueOrDash(byStatus.failed) },
						{ label: 'Skipped', value: this.valueOrDash(byStatus.skipped) },
						{ label: 'Manual reviews queued', value: this.valueOrDash(this.metrics.manualReviewQueued) },
						{ label: 'Avg total ms', value: this.valueOrDash(averages.totalMs) },
						{ label: 'Avg OCR ms', value: this.valueOrDash(averages.ocrMs) },
						{ label: 'Avg pHash ms', value: this.valueOrDash(averages.phashMs) },
					];
				},

				entries: function(value) {
					return Object.entries(value || {});
				},

				valueOrDash: function(value) {
					return value == null || value === '' ? '-' : value;
				},

				displayWithId: function(display, id) {
					return display || this.valueOrDash(id);
				},

				reviewLabel: function(scan) {
					if (scan.manual_review_queued) return 'queued';
					if (scan.manual_review_required) return 'required';
					return '-';
				},

				imageLabel: function(scan) {
					return scan.image_width && scan.image_height ? scan.image_width + 'x' + scan.image_height : '-';
				},

				ruleIdsLabel: function(scan) {
					return Array.isArray(scan.matched_rule_ids) && scan.matched_rule_ids.length
						? scan.matched_rule_ids.join(', ')
						: '-';
				},

				hasOcrPreview: function(scan) {
					return Boolean(scan.ocr_preview && String(scan.ocr_preview).trim());
				},

				openOcrPreview: function(scan) {
					this.ocrPreview = {
						title: scan.message_id ? 'OCR preview for message ' + scan.message_id : 'OCR preview',
						text: this.hasOcrPreview(scan) ? String(scan.ocr_preview) : 'No OCR preview was captured for this scan.',
					};
					showBootstrapModal('#ocrPreviewModal');
				},

				queryString: function() {
					const params = new URLSearchParams();
					params.set('range', this.filters.range || '24h');
					if (this.filters.status) params.set('status', this.filters.status);
					if (this.filters.reasonCode) params.set('reason_code', this.filters.reasonCode);
					if (this.filters.failureStage) params.set('failure_stage', this.filters.failureStage);
					if (this.filters.manualReviewQueued !== '') params.set('manual_review_queued', this.filters.manualReviewQueued);
					if (Number(this.filters.page) > 1) params.set('page', String(this.filters.page));
					return params.toString();
				},

				applyFilters: async function() {
					this.filters.page = 1;
					await this.refresh({ silent: false, updateUrl: true });
				},

				nextPage: async function() {
					this.filters.page = Number(this.page.page || this.filters.page || 1) + 1;
					await this.refresh({ silent: false, updateUrl: true });
				},

				refresh: async function(options) {
					const settings = options || {};
					if (this.isRefreshing) return;
					this.isRefreshing = true;
					this.isLoading = true;
					try {
						const query = this.queryString();
						const response = await requestJson('/scam-scan-history' + (query ? '?' + query : ''));
						this.filters = initialFilters(response.filters);
						this.metrics = response.metrics || {};
						this.ruleHits = response.ruleHits || [];
						this.scans = response.scans || [];
						this.page = response.page || { page: 1, limit: 25, hasMore: false };
						if (settings.updateUrl && window.history && window.history.replaceState) {
							window.history.replaceState(null, '', '/scam-scan-history' + (query ? '?' + query : ''));
						}
					}
					catch (error) {
						if (!settings.silent) {
							notify('error', error.message || 'Failed to refresh scam scan history.');
						}
					}
					finally {
						this.isLoading = false;
						this.isRefreshing = false;
					}
				},
			};
		});

		window.Alpine.data('moderationReviewHistoryPanel', function(config) {
			function initialFilters(filters) {
				const source = filters || {};
				return {
					range: source.range || '24h',
					eventType: source.eventType || '',
					subjectType: source.subjectType || '',
					status: source.status || '',
					action: source.action || '',
					handledState: source.handledState || '',
					userId: source.userId || '',
					channelId: source.channelId || '',
					page: Number(source.page || 1),
				};
			}

			return {
				filters: initialFilters(config.filters),
				metrics: config.metrics || {},
				events: config.events || [],
				page: config.page || { page: 1, limit: 25, hasMore: false },
				details: { title: 'Moderation details', text: '' },
				isLoading: false,
				isRefreshing: false,
				pollTimer: null,

				init: function() {
					const self = this;
					this.pollTimer = window.setInterval(function() {
						self.refresh({ silent: true });
					}, pollIntervalMs);
				},

				destroy: function() {
					if (this.pollTimer) {
						window.clearInterval(this.pollTimer);
						this.pollTimer = null;
					}
				},

				metricCards: function() {
					return [
						{ label: 'Total events', value: this.valueOrDash(this.metrics.total) },
						{ label: 'Pending', value: this.valueOrDash(this.metrics.pending) },
						{ label: 'Handled', value: this.valueOrDash(this.metrics.handled) },
						{ label: 'Event types', value: this.entries(this.metrics.byEventType).length },
						{ label: 'Subject types', value: this.entries(this.metrics.bySubjectType).length },
						{ label: 'Actions', value: this.entries(this.metrics.byAction).length },
					];
				},

				entries: function(value) {
					return Object.entries(value || {});
				},

				valueOrDash: function(value) {
					return value == null || value === '' ? '-' : value;
				},

				displayWithId: function(display, id) {
					return display || this.valueOrDash(id);
				},

				subjectLabel: function(event) {
					const type = event.subject_type || 'subject';
					const display = event.subject_display || event.subject_id || '-';
					return type + ': ' + display;
				},

				openDetails: function(event) {
					this.details = {
						title: event.event_type ? 'Details for ' + event.event_type : 'Moderation details',
						text: JSON.stringify({
							id: event.id,
							event_type: event.event_type,
							subject_type: event.subject_type,
							subject_id: event.subject_id,
							author_id: event.author_id,
							channel_id: event.channel_id,
							source_message_id: event.source_message_id,
							queue_message_id: event.queue_message_id,
							status: event.status,
							action: event.action,
							handled_by: event.handled_by,
							handled_at: event.handled_at,
							summary: event.summary,
							metadata: event.metadata || {},
						}, null, 2),
					};
					showBootstrapModal('#moderationReviewDetailsModal');
				},

				queryString: function() {
					const params = new URLSearchParams();
					params.set('range', this.filters.range || '24h');
					if (this.filters.eventType) params.set('event_type', this.filters.eventType);
					if (this.filters.subjectType) params.set('subject_type', this.filters.subjectType);
					if (this.filters.status) params.set('status', this.filters.status);
					if (this.filters.action) params.set('action', this.filters.action);
					if (this.filters.handledState) params.set('handled_state', this.filters.handledState);
					if (this.filters.userId) params.set('user_id', this.filters.userId);
					if (this.filters.channelId) params.set('channel_id', this.filters.channelId);
					if (Number(this.filters.page) > 1) params.set('page', String(this.filters.page));
					return params.toString();
				},

				applyFilters: async function() {
					this.filters.page = 1;
					await this.refresh({ silent: false, updateUrl: true });
				},

				nextPage: async function() {
					this.filters.page = Number(this.page.page || this.filters.page || 1) + 1;
					await this.refresh({ silent: false, updateUrl: true });
				},

				refresh: async function(options) {
					const settings = options || {};
					if (this.isRefreshing) return;
					this.isRefreshing = true;
					this.isLoading = true;
					try {
						const query = this.queryString();
						const response = await requestJson('/moderation-review-history' + (query ? '?' + query : ''));
						this.filters = initialFilters(response.filters);
						this.metrics = response.metrics || {};
						this.events = response.events || [];
						this.page = response.page || { page: 1, limit: 25, hasMore: false };
						if (settings.updateUrl && window.history && window.history.replaceState) {
							window.history.replaceState(null, '', '/moderation-review-history' + (query ? '?' + query : ''));
						}
					} catch (error) {
						if (!settings.silent) {
							notify('error', error.message || 'Failed to refresh moderation review history.');
						}
					} finally {
						this.isLoading = false;
						this.isRefreshing = false;
					}
				},
			};
		});

		window.Alpine.data('moderationActionLogsPanel', function(config) {
			function initialFilters(filters) {
				const source = filters || {};
				return {
					range: source.range || '24h',
					actionType: source.actionType || '',
					targetUserId: source.targetUserId || '',
					moderatorUserId: source.moderatorUserId || '',
					search: source.search || '',
					page: Number(source.page || 1),
				};
			}

			return {
				filters: initialFilters(config.filters),
				metrics: config.metrics || {},
				logs: config.logs || [],
				page: config.page || { page: 1, limit: 25, hasMore: false },
				actionTypes: config.actionTypes || [],
				details: { title: 'Moderation action details', text: '' },
				isLoading: false,
				isRefreshing: false,
				pollTimer: null,

				init: function() {
					const self = this;
					this.pollTimer = window.setInterval(function() {
						self.refresh({ silent: true });
					}, pollIntervalMs);
				},

				destroy: function() {
					if (this.pollTimer) {
						window.clearInterval(this.pollTimer);
						this.pollTimer = null;
					}
				},

				metricCards: function() {
					return [
						{ label: 'Total actions', value: this.valueOrDash(this.metrics.total) },
						{ label: 'Action types', value: this.entries(this.metrics.byActionType).length },
					];
				},

				entries: function(value) {
					return Object.entries(value || {});
				},

				valueOrDash: function(value) {
					return value == null || value === '' ? '-' : value;
				},

				formatDate: function(value) {
					if (!value) return '-';
					const date = new Date(value);
					return Number.isNaN(date.getTime()) ? String(value) : date.toLocaleString();
				},

				previewContent: function(value) {
					if (!value) return '-';
					const text = String(value);
					return text.length > 80 ? text.slice(0, 80) + '…' : text;
				},

				actionBadgeClass: function(actionType) {
					const map = {
						ban: 'text-bg-danger',
						unban: 'text-bg-success',
						kick: 'text-bg-warning',
						timeout: 'text-bg-warning',
						timeout_remove: 'text-bg-info',
						caged: 'text-bg-secondary',
						uncaged: 'text-bg-info',
						uncaged_expired: 'text-bg-light text-dark',
					};
					return map[actionType] || 'text-bg-secondary';
				},

				openDetails: function(log) {
					this.details = {
						title: log.action_type ? 'Details for ' + log.action_type : 'Moderation action details',
						text: JSON.stringify({
							id: log.id,
							created_at: log.created_at,
							action_type: log.action_type,
							source: log.source,
							target_user_id: log.target_user_id,
							target_username: log.target_username,
							target_display_name: log.target_display_name,
							moderator_user_id: log.moderator_user_id,
							moderator_username: log.moderator_username,
							moderator_display_name: log.moderator_display_name,
							channel_id: log.channel_id,
							source_message_id: log.source_message_id,
							reason: log.reason,
							deleted_content: log.deleted_content,
							audit_log_entry_id: log.audit_log_entry_id,
							metadata: log.metadata || {},
						}, null, 2),
					};
					showBootstrapModal('#moderationActionDetailsModal');
				},

				queryString: function() {
					const params = new URLSearchParams();
					params.set('range', this.filters.range || '24h');
					if (this.filters.actionType) params.set('action_type', this.filters.actionType);
					if (this.filters.targetUserId) params.set('target_user_id', this.filters.targetUserId);
					if (this.filters.moderatorUserId) params.set('moderator_user_id', this.filters.moderatorUserId);
					if (this.filters.search) params.set('search', this.filters.search);
					if (Number(this.filters.page) > 1) params.set('page', String(this.filters.page));
					return params.toString();
				},

				applyFilters: async function() {
					this.filters.page = 1;
					await this.refresh({ silent: false, updateUrl: true });
				},

				nextPage: async function() {
					this.filters.page = Number(this.page.page || this.filters.page || 1) + 1;
					await this.refresh({ silent: false, updateUrl: true });
				},

				refresh: async function(options) {
					const settings = options || {};
					if (this.isRefreshing) return;
					this.isRefreshing = true;
					this.isLoading = true;
					try {
						const query = this.queryString();
						const response = await requestJson('/moderation-action-logs' + (query ? '?' + query : ''));
						this.filters = initialFilters(response.filters);
						this.metrics = response.metrics || {};
						this.logs = response.logs || [];
						this.page = response.page || { page: 1, limit: 25, hasMore: false };
						this.actionTypes = response.actionTypes || this.actionTypes;
						if (settings.updateUrl && window.history && window.history.replaceState) {
							window.history.replaceState(null, '', '/moderation-action-logs' + (query ? '?' + query : ''));
						}
					} catch (error) {
						if (!settings.silent) {
							notify('error', error.message || 'Failed to refresh moderation action logs.');
						}
					} finally {
						this.isLoading = false;
						this.isRefreshing = false;
					}
				},
			};
		});
	}

	function formatUnixTimestamp(timestamp) {
		if (!timestamp) return '';
		const date = new Date(Number(timestamp) * 1000);
		return date.toLocaleString('en-GB', {
			day: '2-digit',
			month: 'short',
			year: 'numeric',
			hour: '2-digit',
			minute: '2-digit',
			second: '2-digit',
		});
	}

	window.panelNotify = {
		success: function(message, title) { notify('success', message, title); },
		error: function(message, title) { notify('error', message, title); },
		info: function(message, title) { notify('info', message, title); },
		warning: function(message, title) { notify('warning', message, title); },
	};
	window.panelRequestJson = requestJson;

	document.addEventListener('alpine:init', registerAlpineComponents);

	if (document.readyState === 'loading') {
		document.addEventListener('DOMContentLoaded', function() {
			configureToastr();
			replaceFeather();
			bindLogoutForm();
		});
	}
	else {
		configureToastr();
		replaceFeather();
		bindLogoutForm();
	}
})();
