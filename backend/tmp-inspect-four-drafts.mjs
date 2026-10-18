import dotenv from 'dotenv';
import mongoose from 'mongoose';
dotenv.config({path:'backend/.env.local-repair'});
await mongoose.connect(process.env.MONGODB_URI,{autoIndex:false});
try {
 const ids=[3957,3967,3990,4003];
 const rows=await mongoose.connection.db.collection('problems').find({displayOrder:{$in:ids}}).project({title:1,displayOrder:1,description:1,inputFormat:1,outputFormat:1,constraints:1,codeTemplates:1,functionContract:1,editorial:1,tags:1,difficulty:1,sourceMetadata:1,externalId:1}).sort({displayOrder:1}).toArray();
 console.log(JSON.stringify(rows,null,2));
} finally { await mongoose.disconnect(); }
