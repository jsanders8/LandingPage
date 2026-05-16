import express from 'express';
import { createRequire } from 'module';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const require = createRequire(import.meta.url);
const Database = require('better-sqlite3');
const __dirname = dirname(fileURLToPath(import.meta.url));

const app = express();
const PORT = 3001;
const isProd = process.env.NODE_ENV === 'production';

const db = new Database(join(__dirname, 'training.db'));
db.pragma('journal_mode = WAL');

db.exec(`
  CREATE TABLE IF NOT EXISTS entries (
    id    INTEGER PRIMARY KEY,
    date  TEXT NOT NULL,
    workouts      TEXT NOT NULL DEFAULT '[]',
    miles         TEXT,
    hipFeel       TEXT,
    effort        TEXT,
    stretching    TEXT,
    avgPace       TEXT,
    avgHR         TEXT,
    maxHR         TEXT,
    trainingEffect TEXT,
    cadence       TEXT,
    zone          TEXT,
    circuitNotes  TEXT,
    notes         TEXT
  )
`);

const getAll  = db.prepare('SELECT * FROM entries ORDER BY date DESC');
const upsert  = db.prepare(`
  INSERT OR REPLACE INTO entries
    (id, date, workouts, miles, hipFeel, effort, stretching,
     avgPace, avgHR, maxHR, trainingEffect, cadence, zone, circuitNotes, notes)
  VALUES
    (@id, @date, @workouts, @miles, @hipFeel, @effort, @stretching,
     @avgPace, @avgHR, @maxHR, @trainingEffect, @cadence, @zone, @circuitNotes, @notes)
`);
const remove  = db.prepare('DELETE FROM entries WHERE id = ?');

app.use(express.json());

if (isProd) {
  app.use(express.static(join(__dirname, 'dist')));
}

app.get('/api/entries', (_req, res) => {
  const rows = getAll.all().map(r => ({ ...r, workouts: JSON.parse(r.workouts) }));
  res.json(rows);
});

app.post('/api/entries', (req, res) => {
  const e = req.body;
  upsert.run({
    id:             e.id,
    date:           e.date,
    workouts:       JSON.stringify(e.workouts ?? []),
    miles:          e.miles         ?? null,
    hipFeel:        e.hipFeel       ?? null,
    effort:         e.effort        ?? null,
    stretching:     e.stretching    ?? null,
    avgPace:        e.avgPace       ?? null,
    avgHR:          e.avgHR         ?? null,
    maxHR:          e.maxHR         ?? null,
    trainingEffect: e.trainingEffect ?? null,
    cadence:        e.cadence       ?? null,
    zone:           e.zone          ?? null,
    circuitNotes:   e.circuitNotes  ?? null,
    notes:          e.notes         ?? null,
  });
  res.json({ ok: true });
});

app.delete('/api/entries/:id', (req, res) => {
  remove.run(parseInt(req.params.id, 10));
  res.json({ ok: true });
});

if (isProd) {
  app.get('*', (_req, res) => res.sendFile(join(__dirname, 'dist', 'index.html')));
}

app.listen(PORT, () => {
  console.log(`API  →  http://localhost:${PORT}`);
  if (isProd) console.log(`App  →  http://localhost:${PORT}`);
});
