import './src/setup.js';
import mongoose from 'mongoose';
import {writeFile} from 'node:fs/promises';
const ids=['6ace18786ca3216598beee57','6ace18786ca3216598beee89','6ace18786ca3216598beee9c','6ace18786ca3216598beeeb7'].map(x=>new mongoose.Types.ObjectId(x));
await mongoose.connect(process.env.MONGODB_URI,{autoIndex:false});
const db=mongoose.connection.db,out=[];
for(const _id of ids){
 const p=await db.collection('problems').findOne({_id});
 const cases=await db.collection('testcases').find({problem:_id}).toArray();
 const registry=await db.collection('question_import_registry').findOne({problemId:_id});
 const libraries=await db.collection('questionlibraries').find({sourceProblemId:_id}).project({sourceKey:1,status:1,visibility:1,sourceProblemId:1,problemDataSnapshot:1,updatedAt:1}).toArray();
 out.push({id:String(_id),title:p?.title,status:p?.status,visibility:p?.visibility,previewValidated:p?.previewValidated,previewTested:p?.previewTested,supportedLanguages:p?.supportedLanguages,validatedLanguages:p?.validatedLanguages,referenceLanguages:Object.keys(p?.referenceSolutions||{}),templateLanguages:Object.keys(p?.codeTemplates||{}),sampleCount:cases.filter(x=>x.kind==='sample').length,hiddenCount:cases.filter(x=>x.kind==='hidden').length,hiddenTestSource:p?.hiddenTestSource,totalMarks:p?.totalMarks,registryReadiness:registry?.readiness,library: libraries.map(x=>({sourceKey:x.sourceKey,status:x.status,visibility:x.visibility,snapshotStatus:x.problemDataSnapshot?.status,snapshotValidated:x.problemDataSnapshot?.previewValidated,snapshotLanguages:x.problemDataSnapshot?.validatedLanguages}))});
}
const report={database:mongoose.connection.name,checkedAt:new Date(),problems:out};
await writeFile('../logs/final-four-drafts-exact-db-audit-20261017.json',JSON.stringify(report,null,2));
console.log(JSON.stringify(report,null,2));
await mongoose.disconnect();
