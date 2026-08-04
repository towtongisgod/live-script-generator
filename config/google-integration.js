(function(root){
  // Fill in clientId after creating an OAuth 2.0 Client ID in Google Cloud Console
  // (APIs & Services -> Credentials -> Create Credentials -> OAuth client ID -> Web application).
  // Authorized JavaScript origin must be this site's exact origin, e.g.
  // https://towtongisgod.github.io (no trailing slash, no path).
  // Scopes used: documents (create/edit the doc) and drive.file (only files this
  // app creates — it never sees the rest of the signed-in user's Drive).
  const GOOGLE_DOCS_CONFIG = {
    clientId: '419522054248-vjh7d7jeu4fp7tiq17u3fit8v2iqu83c.apps.googleusercontent.com',
    scopes: 'https://www.googleapis.com/auth/documents https://www.googleapis.com/auth/drive.file'
  };

  if (typeof module !== 'undefined' && module.exports) {
    module.exports = { GOOGLE_DOCS_CONFIG };
  } else if (root) {
    root.GOOGLE_DOCS_CONFIG = GOOGLE_DOCS_CONFIG;
  }
})(typeof window !== 'undefined' ? window : (typeof global !== 'undefined' ? global : this));
