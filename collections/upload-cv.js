/*jshint esversion: 6 */

import {
    Meteor
} from 'meteor/meteor';
import {
    FilesCollection
} from 'meteor/ostrio:files';
import Grid from 'gridfs-stream';
import {
    MongoInternals
} from 'meteor/mongo';
import fs from 'fs';

let gfs;
if (Meteor.isServer) {
    gfs = Grid(
        MongoInternals.defaultRemoteCollectionDriver().mongo.db,
        MongoInternals.NpmModule
    );
}

export const CV_files = new FilesCollection({
    collectionName: 'CV_files',
    storagePath: '/upload',
    allowClientCode: false,
    debug: false, //Meteor.isServer && process.env.NODE_ENV === 'development',
    responseHeaders: function(responseCode, fileRef, versionRef, version) {
        var headers = {};
        switch (responseCode) {
            case '206':
                headers['Pragma'] = 'private';
                headers['Trailer'] = 'expires';
                headers['Transfer-Encoding'] = 'chunked';
                break;
            case '400':
                headers['Cache-Control'] = 'no-cache';
                break;
            case '416':
                headers['Content-Range'] = "bytes */" + versionRef.size;
        }
        headers['Connection'] = 'keep-alive';
        headers['Content-Type'] = versionRef.type || 'application/octet-stream';
        headers['Accept-Ranges'] = 'bytes';
        headers['Access-Control-Allow-Origin'] = '*'; // <-- Custom header

        headers['Access-Control-Allow-Headers'] = 'Range';
        headers['Access-Control-Expose-Headers'] = 'Accept-Ranges, Content-Encoding, Content-Length, Content-Range';

        return headers;
    },
    onBeforeUpload(file) {
        if (file.size <= 10485760 && /pdf/i.test(file.extension)) return true;
        return 'only pdf file < 10Mb';
    },
    onAfterUpload(file) {
        // console.log(file);
        // Move file to GridFS
        Object.keys(file.versions).forEach(versionName => {
            const metadata = {
                versionName,
                fileId: file._id,
                storedAt: new Date(),
            }; // Optional
            const writeStream = gfs.createWriteStream({
                filename: file.name,
                metadata
            });

            fs.createReadStream(file.versions[versionName].path).pipe(writeStream);

            writeStream.on('close', Meteor.bindEnvironment(file => {
                const property = `versions.${versionName}.meta.gridFsFileId`;
                // If we store the ObjectID itself, Meteor (EJSON?) seems to convert it to a
                // LocalCollection.ObjectID, which GFS doesn't understand.
                this.collection.update(file._id.toString(), {
                    $set: {
                        [property]: file._id.toString()
                    }
                });
                // console.log("UNLINK : ");
                // console.log(this.collection.find(file._id));
                this.unlink(this.collection.find(file._id), versionName); // Unlink file by version from FS
            }));
        });
    },
    interceptDownload(http, file, versionName) {
        // Serve file from GridFS
        // console.log("interceptDownload");
        //
        // console.log(file);
        const _id = (file.versions[versionName].meta || {}).gridFsFileId;
        if (_id) {
            const readStream = gfs.createReadStream({
                _id
            });
            readStream.on('error', err => {
                throw err;
            });
            readStream.pipe(http.response);
        }
        return Boolean(_id); // Serve file from either GridFS or FS if it wasn't uploaded yet
    },
    onAfterRemove(CV_files) {
        // Remove corresponding file from GridFS
        // console.log("onAfterRemove");
        //
        CV_files.forEach(file => {
            Object.keys(file.versions).forEach(versionName => {
                const _id = (file.versions[versionName].meta || {}).gridFsFileId;
                if (_id) gfs.remove({
                    _id
                }, err => {
                    if (err) throw err;
                });
            });
        });
    }
});


if (Meteor.isServer) {
    CV_files.denyClient();
    Meteor.publish('files.cv.all', function() {
        return CV_files.find({}).cursor;
    });


    Meteor.methods({
        RemoveAllfiles: function(dispoId) {
            console.log("RemoveAllfiles : " );
            return CV_files.remove({});
        }
    });

}
