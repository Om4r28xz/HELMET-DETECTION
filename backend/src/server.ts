import './config/env';
import { app } from './app';
import { initWhatsApp } from './services/whatsapp';

const port = Number(process.env.PORT || 3000);

app.listen(port, () => {
  console.log(`Smart Safety Access API listening on port ${port}`);
  initWhatsApp().catch((err) => {
    console.error('Failed to initialize WhatsApp:', err);
  });
});