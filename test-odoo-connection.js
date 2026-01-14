const xmlrpc = require('xmlrpc');

const config = {
  url: 'https://odoo.contacoop.cl',
  database: 'contacoop',
  username: 'carla.n.veliz@gmail.com',
  apiKey: 'Odoo1109'
};

console.log('Config:', JSON.stringify(config, null, 2));

const commonClient = xmlrpc.createSecureClient({
  url: config.url + '/xmlrpc/2/common',
  rejectUnauthorized: false
});

console.log('Testing connection to:', config.url + '/xmlrpc/2/common');

commonClient.methodCall(
  'authenticate',
  [config.database, config.username, config.apiKey, {}],
  (error, uid) => {
    if (error) {
      console.error('Authentication Error:', error.message || error);
      process.exit(1);
    } else if (!uid) {
      console.error('Invalid credentials - no UID returned');
      process.exit(1);
    } else {
      console.log('✓ Connection successful! User ID:', uid);
      process.exit(0);
    }
  }
);
