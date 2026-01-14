const xmlrpc = require('xmlrpc');

const config = {
  url: 'https://odoo.contacoop.cl',
  database: 'contacoop',
  username: 'carla.n.veliz@gmail.com',
  apiKey: 'Odoo1109'
};

const commonClient = xmlrpc.createSecureClient({
  url: config.url + '/xmlrpc/2/common',
  rejectUnauthorized: false
});

commonClient.methodCall(
  'authenticate',
  [config.database, config.username, config.apiKey, {}],
  (error, uid) => {
    if (error || !uid) {
      console.error('Auth failed:', error);
      process.exit(1);
    }

    console.log('Authenticated with UID:', uid);

    const objectClient = xmlrpc.createSecureClient({
      url: config.url + '/xmlrpc/2/object',
      rejectUnauthorized: false
    });

    // Get res.partner fields
    objectClient.methodCall(
      'execute_kw',
      [config.database, uid, config.apiKey, 'res.partner', 'fields_get', [], {attributes: ['string', 'type']}],
      (error, fields) => {
        if (error) {
          console.error('Failed:', error);
          process.exit(1);
        }

        // Filter to show only relevant fields
        const relevantFields = ['id', 'name', 'ref', 'credit', 'debit', 'is_company', 'customer_rank'];
        console.log('\n=== res.partner available fields ===');
        relevantFields.forEach(f => {
          if (fields[f]) {
            console.log(`${f}: ${fields[f].string} (${fields[f].type})`);
          } else {
            console.log(`${f}: NOT FOUND`);
          }
        });
        process.exit(0);
      }
    );
  }
);
