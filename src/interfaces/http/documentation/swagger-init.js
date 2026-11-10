window.addEventListener('DOMContentLoaded', () => {
  window.ui = window.SwaggerUIBundle({
    url: '/openapi.json',
    dom_id: '#swagger-ui',
    deepLinking: true,
    filter: true,
    docExpansion: 'list',
    defaultModelsExpandDepth: -1,
    persistAuthorization: false,
    validatorUrl: null,
    presets: [window.SwaggerUIBundle.presets.apis],
    layout: 'BaseLayout',
    requestInterceptor(request) {
      request.credentials = 'omit';
      if (!['GET', 'HEAD', 'OPTIONS'].includes((request.method || 'GET').toUpperCase())) {
        request.headers['X-CSRF-Protection'] = '1';
      }
      return request;
    },
  });
});
