const { openDb } = require('./db/index');

const db = openDb();

// First get total count
db.get('SELECT COUNT(*) as total FROM photos', (err, countRow) => {
  if (err) {
    console.error('Count error:', err);
  } else {
    console.log(`Total photos in database: ${countRow.total}`);
  }
});

// Then get recent photos
db.all('SELECT id, filename, state, caption, description, keywords FROM photos ORDER BY id DESC LIMIT 20', (err, rows) => {
  if (err) {
    console.error('Database error:', err);
  } else {
    console.log('\nRecent photos in database:');
    rows.forEach(row => {
      const aiStatus = row.caption ? 'processed' : 'pending';
      console.log(`${row.id}: ${row.filename} - State: ${row.state} - AI: ${aiStatus}`);
    });

    // Count by state
    const stateCounts = rows.reduce((acc, row) => {
      acc[row.state] = (acc[row.state] || 0) + 1;
      return acc;
    }, {});
    console.log('\nState breakdown:');
    Object.entries(stateCounts).forEach(([state, count]) => {
      console.log(`  ${state}: ${count}`);
    });
  }
  db.close();
});