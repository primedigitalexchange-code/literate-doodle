require('dotenv').config();

const { createAppConfig } = require('./config');
const { createApp } = require('./app');

const config = createAppConfig();

if (config.missingEnvVars.length > 0) {
  console.error(`Missing required environment variables: ${config.missingEnvVars.join(', ')}`);
  process.exit(1);
}

const app = createApp({ config });

app.listen(config.port, () => {
  console.log(`Stripe Connect foundation listening on port ${config.port}`);
});
