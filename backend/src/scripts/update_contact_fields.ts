import fs from 'fs';
import mongoose from 'mongoose';

async function main() {
  await mongoose.connect('mongodb://localhost:27017/flowdesk');
  const db = mongoose.connection.db;
  if (!db) return;

  // 1. Update Aman
  await db.collection('contacts').updateOne(
    { phone: '+918655021064' },
    {
      $set: {
        'customFields.Job Title': 'Full Stack Developer & DevOps Engineer',
        'customFields.Interview Slot': '14th Nov 2026 between 2:00 PM and 4:00 PM',
        'customFields.jobTitle': 'Full Stack Developer & DevOps Engineer',
        'customFields.interviewSlot': '14th Nov 2026 between 2:00 PM and 4:00 PM'
      }
    }
  );
  console.log('Updated Aman (+918655021064)');

  // 2. Update CSV contacts
  const csvPath = 'Full Stack Developer Data.csv';
  if (fs.existsSync(csvPath)) {
    const lines = fs.readFileSync(csvPath, 'utf8').trim().split('\n').slice(1);
    for (const line of lines) {
      const parts = line.split(',');
      if (parts.length >= 4) {
        const phone = '+91' + parts[1].trim();
        const jobTitle = parts[2].trim();
        const slot = parts[3].trim();
        await db.collection('contacts').updateOne(
          { phone },
          {
            $set: {
              'customFields.Job Title': jobTitle,
              'customFields.Interview Slot': slot,
              'customFields.jobTitle': jobTitle,
              'customFields.interviewSlot': slot
            }
          }
        );
      }
    }
    console.log('Updated all 10 contacts from CSV with Job Title and Interview Slot');
  }

  await mongoose.disconnect();
}

main().catch(console.error);

