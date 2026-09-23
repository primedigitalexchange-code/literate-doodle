require('dotenv').config();

const { createAppConfig } = require('./config');
const { createApp } = require('./app');

const config = createAppConfig();
const app = createApp({ config });

app.listen(config.port, () => {
  console.log(`Stripe Connect foundation listening on port ${config.port}`);
});
