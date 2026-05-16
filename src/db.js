import Dexie from 'dexie';

const db = new Dexie('HalfMarathonTraining');

db.version(1).stores({
  entries: 'id, date',
});

export default db;
