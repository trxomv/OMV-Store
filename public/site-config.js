(function configureOmvSite(root) {
  const config = Object.freeze({
    // Central read-only Web App deployed by the owner; pages use it for live workbook data.
    // If it is unavailable, the browser client retains the last valid response and reports stale data.
    centralApiEndpoint: "https://script.google.com/macros/s/AKfycbxA0HUgyz9ngQpykOuFL2VpcgQ0INtA0bSNPZk0ToX0N1De-NZ8fx-BMXbOWJ-Whpe7/exec",
  });
  root.OMV_SITE_CONFIG = config;
  root.WE_SITE_CONFIG = config;
})(window);
