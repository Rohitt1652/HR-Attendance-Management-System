require('dotenv').config();
const mongoose = require('mongoose');
mongoose.connect(process.env.MONGO_URI).then(async () => {
  const result = await mongoose.connection.collection('leavetypes').updateOne(
    { code: 'MPL' },
    { $set: { isActive: false } }
  );
  console.log('MPL deactivated:', result.modifiedCount);
  mongoose.disconnect();
}).catch(e => console.error(e.message));
