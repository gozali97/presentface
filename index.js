const express = require('express');
const app = express();
const port = 3003;

app.get('/', (req, res) => {
  res.send('Presentface app is running!');
});

app.listen(port, () => {
  console.log(`Presentface app listening at http://localhost:${port}`);
});