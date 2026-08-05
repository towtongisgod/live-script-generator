(function(root){
  // Public configuration only — no credential, token, or secret belongs in
  // this file. `endpoint` is the deployed Apps Script Web App's /exec URL;
  // knowing it lets someone POST a script export request, but writing
  // actually still requires that Web App deployment's own Access setting
  // (see google-apps-script/README.md "Access and Security").
  const GOOGLE_APPS_SCRIPT_CONFIG = {
    endpoint: 'https://script.google.com/macros/s/AKfycbzDr1XnkdkCT7dRPOEb_QvGMYYCzpp0tHoz3iFAxoEp2SRIpq-Ur4nBxEZn_ZNs3L0q/exec'
  };

  if (typeof module !== 'undefined' && module.exports) {
    module.exports = { GOOGLE_APPS_SCRIPT_CONFIG };
  } else if (root) {
    root.GOOGLE_APPS_SCRIPT_CONFIG = GOOGLE_APPS_SCRIPT_CONFIG;
  }
})(typeof window !== 'undefined' ? window : (typeof global !== 'undefined' ? global : this));
