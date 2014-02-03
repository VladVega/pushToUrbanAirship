
var mongodb= require('mongodb'),
    Express= require('express'),
    UploadStreamMiddleware= require('./../gridUploader')
    http= require('http');

/*var mongoUrl= 'yourMongoUrl',
    cloudinaryConf={
        cloud_name: 'yourCloudinaryName',
        api_key: 'yourApiKey',
        api_secret: 'yourApiSecret'
    };
    */
var mongoUrl= 'mongodb://monsoon:monsoon1855@ds027668.mongolab.com:27668/zooplr_search',
    cloudinaryConf={
        cloud_name: 'monsoon',
        api_key: '683422432131363',
        api_secret: 'zFh19SV6E7xtt7Jl1WB2f-TG0Bc'
    };


var app = Express();
app.use(Express.static(__dirname + '/public'));

http.createServer(app).listen(5001, function(err){
    if(err) return console.log('Server start error:',err);

    mongodb.connect(mongoUrl , function(err, db){
        if(err) return console.log('Mongo connect error:',err);

        var uploadMiddlewareFunction= UploadStreamMiddleware(db,cloudinaryConf);

        app.post('/upload', uploadMiddlewareFunction, function(req, res, next) {
            console.log('File meta and storage ids:',req.fileInfoArr);
            res.json({file_data: req.fileInfoArr});
        });

        console.log('Ready for uploads.')
    });
});





