(function () {
  function replaceFeather() {
    if (window.feather && typeof window.feather.replace === 'function') {
      window.feather.replace({ width: '16px', height: '16px' });
    }
  }
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', replaceFeather);
  } else {
    replaceFeather();
  }
})();
