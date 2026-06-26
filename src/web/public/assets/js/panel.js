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
