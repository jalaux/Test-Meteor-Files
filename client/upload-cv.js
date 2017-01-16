/*jshint esversion: 6 */
import {
    Template
} from 'meteor/templating';
import {
    ReactiveVar
} from 'meteor/reactive-var';
import {
    CV_files
} from '/collections/upload-cv.js';


Meteor.subscribe('files.cv.all');

Template.UploadedFiles.helpers({
    uploadedFiles: function() {
        return CV_files.find({});
    }
});

Template.UploadCV.onCreated(function() {
    this.currentUpload = new ReactiveVar(false);
});

Template.UploadCV.helpers({
    currentUpload: function() {
        return Template.instance().currentUpload.get();
    }
});

Template.UploadedFiles.onRendered(function() {
    var template = Template.instance();

    this.autorun(function() {
        var cvs = CV_files.find().each();
        cvs.forEach(function(cv) {
            thumbnail(cv.link(), template);
        });
    });


});

Template.UploadCV.events({
    'change #fileInput': function(e, template) {
        if (e.currentTarget.files && e.currentTarget.files[0]) {
            // We upload only one file, in case
            // there was multiple files selected
            var file = e.currentTarget.files[0];

            if (file) {

                var uploadInstance = CV_files.insert({
                    file: file,
                    streams: 'dynamic',
                    chunkSize: 'dynamic'
                }, false);

                uploadInstance.on('start', function() {
                    template.currentUpload.set(this);
                });

                uploadInstance.on('end', function(error, fileObj) {
                    if (error) {
                        alert("Error : " + error.reason);
                    }
                    template.currentUpload.set(false);
                });

                uploadInstance.start();
            }
        }
    }
});

Template.UploadedFiles.onCreated(function() {
    this.cvPreview = new ReactiveDict();
});;

Template.UploadedFiles.helpers({
    img: function(pdfURL) {
        var template = Template.instance();
        console.log('pdfURL : ' + pdfURL);
        var img = template.cvPreview.get(pdfURL);
        if (!img) {
            return Spacebars.SafeString('<div class="ui image active centered inline loader" style="margin-top: 200px;"></div>');
        } else {
            return Spacebars.SafeString(img);
        }
    },
    // uploadedDate: function(file) {
    //     console.log(file);
    // }
});

thumbnail = function(pdfURL, template) {
    var pdfURLModfied = pdfURL + '?download=false';
    PDFJS.workerSrc = '/packages/pascoual_pdfjs/build/pdf.worker.js';
    PDFJS.getDocument(pdfURLModfied).then(function(pdf) {
        pdf.getPage(1).then(function(page) { //1 is the page number we want to retrieve
            var viewport = page.getViewport(1);
            var canvas = document.createElement('canvas');
            var ctx = canvas.getContext('2d');
            canvas.height = viewport.height;
            canvas.width = viewport.width;

            var renderContext = {
                canvasContext: ctx,
                viewport: viewport
            };

            page.render(renderContext).then(function() {
                //set to draw behind current content
                ctx.globalCompositeOperation = "destination-over";

                //set background color
                ctx.fillStyle = "#ffffff";

                //draw background / rect on entire canvas
                ctx.fillRect(0, 0, canvas.width, canvas.height);
                var img = canvas.toDataURL();
                // console.log("Set ReactiveDict : " + pdfURL);
                template.cvPreview.set(pdfURL, '<img src="' + img + '"/>');
                // $("#" + elementID).html();
            });
        });
    });
};



Template.RemoveAllfiles.events({
    "click #deleteAllFiles": function(event, template) {

        return Meteor.call("RemoveAllfiles", function(error, result) {
            if (error) {
                console.log("error", error);
            }
            if (result) {
                return "All files have been removed";
            }
        });

    }
});
