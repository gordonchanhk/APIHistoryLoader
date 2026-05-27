const express = require('express');
const path = require('path');

const app = express();
const PORT = 3000;

app.use(express.static(path.join(__dirname, 'public')));

app.listen(PORT, async () => {
  console.log(`Server running at http://localhost:${PORT}`);
  try {
    const open = (await import('open')).default;
    open(`http://localhost:${PORT}`);
  } catch (e) {
    console.log('Could not auto-open browser. Please navigate manually.');
  }
});
