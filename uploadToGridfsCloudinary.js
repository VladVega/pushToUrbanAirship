// The MIT License
//
// Copyright (c) 2014 Vlad Vega
//
// Permission is hereby granted, free of charge, to any person obtaining a
// copy of this software and associated documentation files
// (the "Software"), to deal in the Software without restriction,
// including without limitation the rights to use, copy, modify, merge,
// publish, distribute, sublicense, and/or sell copies of the Software, and
// to permit persons to whom the Software is furnished to do so, subject to
// the following conditions:
//
// The above copyright notice and this permission notice shall be included
// in all copies or substantial portions of the Software.
//
// THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS
// OR IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF
// MERCHANTABILITY, FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT.
// IN NO EVENT SHALL THE AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY
// CLAIM, DAMAGES OR OTHER LIABILITY, WHETHER IN AN ACTION OF CONTRACT,
// TORT OR OTHERWISE, ARISING FROM, OUT OF OR IN CONNECTION WITH THE
// SOFTWARE OR THE USE OR OTHER DEALINGS IN THE SOFTWARE.

//Dependencies
var Busboy = require('busboy'),
    mongo = require('mongodb'),
    _ = require('lodash'),
    Grid = require('gridfs-stream'),
    async= require('async'),
    Cloudinary = require('cloudinary');


//Constants
var Multipart_Check = /^multipart/,
    Image_Check= /^image\/.*$/i;


module.exports = function gridfsAndCloudinaryUploader(mongoDBInstance, cloudinaryConfigObj ){

    Cloudinary.config(cloudinaryConfigObj);
    var GridInst= new Grid(mongoDBInstance, mongo);

    return function(req, res, next){
        if ((req.method === 'POST' || req.method === 'PUT') && req.readable && Multipart_Check.test(req.get('Content-Type'))) {

            var busboy = new Busboy({ headers: req.headers }),
                filesStartedProcessing = 0;

            req.fileInfoArr= [];

            busboy.on('file', function(fieldname, fileStream, filename, encoding, mimetype) {

                var gridStream,
                    cloudinaryStream,
                    gridFileName,
                    fileInfo;

                filesStartedProcessing += 1;
                gridFileName = mongoDBInstance.bson_serializer.ObjectID().toString();
                fileInfo= {name: filename, type: mimetype, storage_id: gridFileName }

                async.parallel([
                    function gridStreamInsertion(cb){
                        gridStream= GridInst.createWriteStream({
                            filename: gridFileName,
                            content_type: mimetype
                        });
                        gridStream.on('close', function (file) {
                            // do something with `file`
                            console.log('closing:',file);
                            cb();
                        });
                        fileStream.pipe(gridStream);
                    },
                    function cloudinaryStreamInsertion(cb){
                        if(Image_Check.test(mimetype)){

                            cloudinaryStream= getCloudinaryStream(gridFileName, function(err, result){
                                //executes at end of stream
                                if(err) return cb(err);
                                fileInfo= _.extend(result, fileInfo);
                                cb();
                            });

                            fileStream.on('data',cloudinaryStream.write);
                            fileStream.on('end',cloudinaryStream.end);

                            fileInfo.storage_type = 'cloudinary';

                        }else{
                            fileInfo.storage_type = 'gridfs';
                            cb()
                        }
                    }
                ],function(err, results){
                    if(err) return next(err);

                    req.fileInfoArr.push(fileInfo);
                });

            });
            busboy.on('field', function(fieldname, val, valTruncated, keyTruncated) {
                if(fieldname && fieldname == 'json_params' ){ //preferred way of including additional params
                    try{
                        req.body = JSON.parse( val);
                    }catch(e){
                        next(new Error('Multipart form parameters are not stringified json type.'))
                    }
                }else if(fieldname){ //if included as separate form elements
                    req.body[fieldname] = val;
                    var val2;
                    try{
                        val2 = JSON.parse(val);
                        req.body[fieldname] = val2;
                    }catch(e){}
                }

            });
            busboy.on('error', function(err) {
                next(err);
            });
            busboy.on('end', function() {
                if(req.fileInfoArr){
                    console.log('Files uploaded:',req.fileInfoArr.length);
                }
                endMultipart();
            });
            req.pipe(busboy);
        }else{
            next();
        }

        function endMultipart(){
            if(filesStartedProcessing > req.fileInfoArr.length){ //ensures that streams are closed out and all files processed before ending them processing.
                return setTimeout(endMultipart, 100);
            }

            //attach separate form params to the file object
            if(_.isArray(req.fileInfoArr) && _.isObject(req.body.file_meta)){
                req.fileInfoArr.forEach(function(fileInfo){
                    if(fileInfo){
                        _.extend(fileInfo, req.body.file_meta[fileInfo.name]);
                    }
                })
            }

            next();
        }
    }
};

function getCloudinaryStream(name, callback){
    return Cloudinary.uploader.upload_stream(
        function(result) {
            if(!_.isObject(result)){
                return callback(new Error('Cloudinary result is not an object.'));
            }
            if(result.error){
                return callback(new Error(result.error.message));
            }

            callback(null, {
                url: result.url,
                ext: result.format
            });
        },
        {
            public_id: name
        }
    );
}
