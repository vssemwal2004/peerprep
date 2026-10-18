import './src/setup.js';
import mongoose from 'mongoose';
await mongoose.connect(process.env.MONGODB_URI,{autoIndex:false});
for(const id of ['6ace18786ca3216598beee57','6ace18786ca3216598beee9c']){
 const p=await mongoose.connection.db.collection('problems').findOne({_id:new mongoose.Types.ObjectId(id)},{projection:{title:1,status:1,tags:1,editorial:1,editorialMeta:1,companyTags:1,updatedAt:1,referenceSolutions:1}});
 const r=await mongoose.connection.db.collection('question_import_registry').findOne({problemId:new mongoose.Types.ObjectId(id)});
 console.log(JSON.stringify({id,p,registry:r&&{_id:r._id,keys:Object.keys(r),content:r.content,readiness:r.readiness,updatedAt:r.updatedAt}},null,2));
}
await mongoose.disconnect();
