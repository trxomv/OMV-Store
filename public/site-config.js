(function configureOmvSite(root) {
  const config = Object.freeze({
    // Central read-only Web App deployed by the owner; pages use it for live workbook data.
    // If it is unavailable, the browser client retains the last valid response and reports stale data.
    centralApiEndpoint: "https://script.google.com/macros/s/AKfycbyzE6Eq4R08y3OwCAFCEd5byHy1D2YMlKNNuRm6-qlr6GZI6LGiLJxpNZzWCopbf7-CIQ/exec",
  });
  root.OMV_SITE_CONFIG = config;
  root.WE_SITE_CONFIG = config;
})(window);
