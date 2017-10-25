var segment= 'quierobesarte.es';


var userId;
var password;
var maxOperationsPerHour = 60;

var util = require('util');
var fs = require('fs');
var process = require('process')
var Client = require('instagram-private-api').V1;
var device = new Client.Device(segment);
var storage = new Client.CookieFileStorage(__dirname + '/cookies/' + segment + '.json');
var mongoose = require('mongoose');
var _ = require('lodash');
var Promise = require('bluebird');
const eachAsync = require('each-async');

const { getFaceInfo } = require('./face');
if (!fs.existsSync('./tmp/')){
    fs.mkdirSync( './tmp/');
}

var User = mongoose.model('User', { 
    segment: String, 
    userId:String, 
    username:String, 
    isFollower: Boolean, 
    isPrivate: Boolean,
    providerId: String, 
    createdDate: Date,
    requestDate: Date,
    requestNumber:{ type: Number, default: 0 }, 
    pictureUrl: String,
    order:Number,
    gender: String,
    age: Number,
    eyeMakeup: Boolean,
    lipMakeup: Boolean,
    isFaceEval: Boolean,
    unfollowed: Boolean

});


var progressCounter = 0;

const login = (userId, password) => {
    this.userId = userId;
    this.password = password;
    this.currentLoginUser = {
        id: userId, 
        password: password
    };
    var user_mongo = process.env.USER_MONGO
    var pwd_mongo = process.env.PWD_MONGO
    this.segment =  userId;
    mongoose.connect('mongodb://' + user_mongo + ':' + pwdMongo + '@ds123695.mlab.com:23695/instagram', { useMongoClient: true });
    mongoose.Promise = Promise;
    var db = mongoose.connection;
    db.on('error', console.error.bind(console, 'connection error:'));
}

const updateTargetFollowers = (loginUser, targetUsername) => {
    currentLoginUser = loginUser;
    var currentSession;
    var followers;
    var promise = new Promise(function(resolve) {
     
   
        var setId = function(name, id) {
            var targetIndex = _.findIndex(targetUsers, function(userName) { return userName === name; });
            if(targetIndex < 0){
                return;
            }
            targetUsers[targetIndex].id = id;
        }

        getUserId(loginUser, targetUsername).then((response)=>{
            var user;
            if(!response.hasError){
                user = response.data;
            }
            var cacheFile = './tmp/' + targetUsername + '_followers.json';
            if(!fs.existsSync(cacheFile)) {
                
                Client.Session.create(device, storage, loginUser.id, loginUser.password)
                .then(function(session) {
                    console.log('Procesing...');
         
                    var followerCount = user.followerCount;
                    var targetUser = {
                        id: user.id, 
                        name: targetUsername,
                        currentSession: session
                    };
                   
                    getFollowers(targetUser, followerCount, true).then(function(){
                        resolve();
                    })
                });
            } else {
                var feeds = JSON.parse(fs.readFileSync(cacheFile, 'utf8'));
                saveUpdateFollowers(1, feeds, user.id).then(function(followers){
                    resolve();
                });
            }
        });
    });

    return promise;
};



const start = (loginUser) => {
    currentLoginUser = loginUser;
    var promise = new Promise(function(resolve) {
        getCurrentUserInfo(loginUser).then((currentUserInfo)=>{
            var data = {
                currentUserInfo: currentUserInfo
            }         
            return [data, User.find({ 
                requestNumber: 0,
                unfollowed: {$ne: true},
                isFollower: {$ne: true},
                isPrivate: {$ne: true},
            }).
            sort({ order: 1 })];

        }).spread((data, targetUsers) => {
            var max = 50;
            var counter = 0;
            var iteration = 0;
            var doNext = true;
            var globalCounter = 0;
            function loop() {
                function internalLoop() {
                    if(counter > max){
                        clearInterval(internalPointer);
                        counter = 0;
                        doNext= true;
                    } else {
                        if(doNext) {
                            var item = targetUsers[globalCounter];
                            doNext = false;
                            globalCounter++;

                            //TODO Remove
                            item.isFaceEval = true;

                            if(item && !item.isFaceEval ){
                                
                                getFaceInfo(item.pictureUrl.replace('s150x150','')).then((faceInfo)=> {
                                    if(faceInfo){
                                        item.gender = faceInfo.gender;
                                        item.age = faceInfo.age;
                                        item.lipMakeup = faceInfo.makeup.lipMakeup;
                                        item.eyeMakeup = faceInfo.makeup.eyeMakeup;
                                    }
                                    item.isFaceEval = true;
                                    item.isFollower = isFollower(item.userId, data.currentUserInfo.followers );
                                    item.save().then((respose)=>{
                                        //if(!item.isFollower && item.gender === "female"){
                                        if(!item.isFollower){
                                            createRelationship(item.username).then((added)=>{
                                                if(added){
                                                    counter++;
                                                }
                                                doNext= true;
                                            })
                                        } else {
                                            doNext= true;
                                        }
                                        console.log(counter + '-' + globalCounter );
                                        
                                    });       
                                })
                            } else if ( item && item.isFaceEval ) {
                                item.isFollower = isFollower(item.userId, data.currentUserInfo.followers );
                                item.save().then((respose)=>{
                                    //if(!item.isFollower && item.gender === "female"){
                                    if(!item.isFollower){
                                        createRelationship(item.username).then((added)=>{
                                            if(added){
                                                counter++;
                                            }
                                            doNext= true;
                                           
                                        })
                                    } else {
                                        doNext= true;
                                    }
                                    console.log(counter + '-' + globalCounter );
                                });
                            } else{
                                doNext = true;
                            }
                        }
                    }
              
                }
                internalLoop();
                var internalPointer = setInterval(internalLoop,  500);
                iteration++;
            }

            loop();
            var loopPointer = setInterval(loop, 60 * 60 * 1000);

        })
    })
    return promise;  
};

const removeNotFollowers =  (loginUser) => {
    currentLoginUser = loginUser;

    var promise = new Promise(function(resolve) {
        getCurrentUserInfo(loginUser).then((currentUserInfo)=>{
            return  getFollowingNotFollowers( currentUserInfo);
        }).
        then((notFollowers)=>{
            notFollowers = notFollowers.reverse();
            var max = 50;
            var counter = 0;
            var iteration = 0;
            var doNext = true;
            var globalCounter = 0;
            function loop() {

                function internalLoop() {
                    if(counter > max){
                        clearInterval(internalPointer);
                        counter = 0;
                        doNext= true;
                    } else {
                        if(doNext) {
                            var item = notFollowers[globalCounter];
                            doNext = false;
                            globalCounter++;
                            destroyRelationship(item.username).then((user)=>{
                                if(user){
                                    setUnfollowed(user.username);
                                }
                                counter++;
                                doNext= true;
                            });
                            
                        }
                    }
              
                }
                internalLoop();
                var internalPointer = setInterval(internalLoop,  500);
                iteration++;
            }

            loop();
            var loopPointer = setInterval(loop, 60 * 60 * 1000);
        })
    });
    
    return promise;  
}

const createRelationship = (username) => {
    var promise = new Promise(function(resolve) {
        getUserId(currentLoginUser, username).then((response)=>{
            var user;
            if(!response.hasError){
                user = response.data;
            }
            
            if(user && !user.friendshipStatus.outgoing_request){
                if(!user.friendshipStatus.is_private){
                    debugger;
                    console.log('Creating relationship to ' + username );
                    return Client.Relationship.create(currentSession, user.id)
                } else {
                    User.findOne({segment: segment, username: username}).then((user)=>{
                        if(user){
                            user.isPrivate = true;
                        }
                        user.save();
                    })
                    resolve(false);
                }
                
            } else {
                if(user && !user.requestNumber){
                    User.findOne({ userId:user.id }).then((item)=>{
                        if(item){
                            item.requestDate =  Date.now(),
                            item.requestNumber = 1;
                            item.save();
                        }
                    })
                }
                resolve(false);
            }
        }).then((relationship)=>{
            if(relationship){
                process.stdout.clearLine();  
                process.stdout.cursorTo(0);  
                console.log('[OK]');
                return User.findOne({segment: segment, username: username});
            } else {
                resolve(false);
               
            }
        }).then((user)=>{
            if(user){
                user.requestDate =  Date.now();
                user.requestNumber += 1; 
                user.save((response)=>{
                    resolve(true);
                })
            } else {
                resolve(false);
            }

        })
       
    });

    return promise;
}

const destroyRelationship = (username) => {
    var promise = new Promise(function(resolve) {
        getUserId(currentLoginUser, username).then((response)=>{
            var user;
            if(!response.hasError){
                user = response.data;
            }
            if(user && !user.friendshipStatus.outgoing_request){
                console.log('Destroy relationship with ' + username );
                return Client.Relationship.destroy (currentSession, user.id);
            } else {
                resolve();
            }
        }).then((relationship)=>{
            process.stdout.clearLine();  
            process.stdout.cursorTo(0);  
            console.log('[OK]');
            if(relationship){
                return User.findOne({segment: segment, username: username});
            } else {
                resolve();
            }
        }).then((user)=>{
             resolve(user);
        })
       
    });

    return promise;
}
const getFollowingNotFollowers = (userInfo) =>{
    return _.differenceBy(userInfo.followings, userInfo.followers, 'id');
}

const isFollower = (userId, providerFollowers) => {
    var user =_.find(providerFollowers,{
        id: parseInt(userId)
    });
    return user?true:false;
}

const setUnfollowed = (username) => {
    User.findOne({segment: segment, username: username}, function(err,user) { 
        if(!err){
            if(user) {
                user.unfollowed = true;
                user.save(function (err) {
                    if (err) {
                        console.log(err);
                    }
                });
            }
        }
    });
}

const getUserId = (loginUser, username) => {
    var promise = new Promise(function(resolve) {
            Client.Session.create(device, storage, loginUser.id, loginUser.password).then(function(session) {
                var data = {
                    currentSession: session
                }
                currentSession = session;
                return Client.Account.searchForUser(session, username);    
            }).then(function(user) {
                resolve({hasError: false, data: user._params});
            }).catch(function(e){
                resolve({hasError: true, error: e});
            })
    })
    return promise;
}

const getUserInfoByUserName = (loginUser, username) => {
    return gettUserInfo(loginUser, username);
};

const getCurrentUserInfo = (loginUser) => {
    return gettUserInfo(loginUser, segment);
};

const gettUserInfo = (loginUser, targerUsername) => {
    var promise = new Promise(function(resolve) {
        Client.Session.create(device, storage, loginUser.id, loginUser.password).then(function(session) {
            var data = {
                currentSession: session
            }
            return [data,Client.Account.searchForUser(session, targerUsername)];    
        }).spread(function(data, user) {
            data.followerCount = user._params.followerCount;
            data.currentUser = {
                id: user._params.id,
                name: user._params.username,
                currentSession: data.currentSession
            };
            console.log('Getting ' + targerUsername +' followings');
            return [data, getFollowing( data.currentUser)];
        }).spread(function(data, followings) {
            process.stdout.clearLine();  
            process.stdout.cursorTo(0);  
            console.log('[OK]');
            data.followings = followings;
            console.log('Getting ' + targerUsername +' followers');
            return [data, getFollowers( data.currentUser, data.followerCount)];
        }).spread(function(data, followers) {
            process.stdout.clearLine();  
            process.stdout.cursorTo(0);  
            console.log('[OK]');
            data.followers = followers;
            resolve(data);
        });
    });
    return promise;  
};

const getFollowers = (user, followerCount, saveUsers) => {
    var accountFollowers = new Client.Feed.AccountFollowers(user.currentSession, user.id);   
    var page = 1;
    var getMore = true;
    var counter = 0;
    var feedsDone= [];
    var cacheFile = './tmp/' + user.name + '_followers.json';


    var promise = new Promise(function(resolve) {

        if(!fs.existsSync(cacheFile)) {
            var timeoutObj = setInterval(function() {                           
                if(counter > followerCount){
                    clearInterval(timeoutObj);
                    printPercent(100);
                    fs.writeFileSync(cacheFile, JSON.stringify(feedsDone) , 'utf-8');
                    resolve(feedsDone);
                } else {
                    printPercent(parseInt((counter/followerCount)*100));
                    if(getMore){
                        getMore= false;
                        accountFollowers.get().then(function(results) {
                            if(results && results.length > 0){
                                var data = _.flattenDeep(results);
                                var followers = _.map(data, function(feed){
                                    return    feed._params;  
                                });
                                if(saveUsers){
                                    saveUpdateFollowers(page, followers, user.id).then(function(followers){
                                        Array.prototype.push.apply(feedsDone, followers);
                                        getMore = true;
                                        counter += followers.length;
                                        page++;
                                    });
                                } else {
                                    Array.prototype.push.apply(feedsDone, followers);
                                    getMore = true;
                                    counter += followers.length;
                                    page++;
                                }
                            } else {
                                counter = followerCount + 1;
                            }
                        })
                    
                    }
                }
                
            }, 1000);  
        } else {
            var feeds = JSON.parse(fs.readFileSync(cacheFile, 'utf8'));
            resolve(feeds);
        }
    })

    return promise;
};

const getFollowing = (user) => {
    var accountFollowing = new Client.Feed.AccountFollowing(user.currentSession, user.id);
    var promise = new Promise(function(resolve) {
        accountFollowing.get().then(function(results) {
            var data = _.flattenDeep(results);
            var feeds = _.map(data, function(feed){
                return    feed._params;  
            });
            resolve(feeds);
        })
    });

    return promise;
}


const saveUpdateFollowers = (page, feeds, providerId) => {
    var total = feeds.length;
    var count = 0;
    providerId = providerId | 0;
    var promise = new Promise(function(resolveSave) {
     
        _.forEach(feeds, function(value, index) {
            
            var userId= value.id;
            var username= value.username;
           
            var pictureUrl = value.profilePicUrl;
            if(!pictureUrl){
                pictureUrl = value.picture;
            }
            //console.log(index);
            User.findOne({segment: segment, username: username}, function(err,user) { 
                if(!err){
                    if(!user) {
                        debugger;
                        user = new User({ 
                            providerId: providerId, 
                            segment: segment, 
                            userId: userId, 
                            username: username, 
                            createdDate:  Date.now(),
                            order: (index +1 ) * page,
                            pictureUrl: pictureUrl,
                            requestNumber: 0
                        });
                    } else {
                        user.order = (index +1 ) * page;
                    }

                    user.save(function (err) {
                        if (err) {
                            console.log(err);
                        }
                    });
                }
                printPercent(parseInt((count/total)*100), "Saving user '" + user.username + "'");
                count++;
                if(count === total){
                    resolveSave(feeds);
                }
               
            });
    
    
        });
    });

    return promise;
}


const createFile = (filename) => {
    fs.open(filename,'r',function(err, fd){
      if (err) {
        fs.writeFile(filename, '', function(err) {
            if(err) {
                console.log(err);
            }
            console.log("The file was saved!");
        });
      } else {
        console.log("The file exists!");
      }
    });
  }


  const printPercent = (number, post)  => {
    if(!post){
        post ='';
    }
    process.stdout.clearLine();  // clear current text
    process.stdout.cursorTo(0);  // move cursor to beginning of line
    process.stdout.write( number+'% ' + post);
  }

  




  module.exports = {  login, updateTargetFollowers, start, removeNotFollowers };