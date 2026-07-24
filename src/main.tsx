import './ui/styles.css';
import { createApp } from '@app';

const rootElement = document.getElementById('root');
if (!rootElement) {
  throw new Error('Elemento #root não encontrado no documento.');
}

createApp(rootElement);
