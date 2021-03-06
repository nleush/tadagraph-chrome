// Tadagraph API
API = function(CONFIG) {this.CONFIG = CONFIG;};

// Basic API
API.prototype.login = function login(callback) {
  if (!callback) throw Error('callback is required argument');
  
  var that = this;
  
  $.ajax({
    url: this.CONFIG.HOST + '/api/me',
    success: function(data) {
      if (data) {
        callback(data);
        that.online = true;
      } else {
        retry();
        
      }
    },
    error: retry
  });
  
  function retry() {
    setTimeout(function() {
      that.login(callback);
    }, that.CONFIG.LOGIN_TIMEOUT);
    that.online = false;
  }
};

API.prototype.init = function(callback) {
  var that = this;
  this.login(function(username) {
    var db = $.couch.db(username, {type: "user", 
                        urlPrefix: that.CONFIG.HOST + "/api/people",
                        urlSuffix: "couchdb"});
    that.db = db;  
    callback(db);
  });
};

// Notifications API part
API.prototype.getNotifications = function(options) {
  var now = new Date(); 
  var todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate()); 
  var DAY_MILISECONDS = 60 * 60 * 24 * 1000; 
  var UNREAD_ACTUALITY_PERIOD = DAY_MILISECONDS * 2; 
  var minDate = todayStart.getTime() - UNREAD_ACTUALITY_PERIOD; 

  this.db.view("notifier-app/count", $.extend(true, {
    error: function() {
    }
  }, options, {
    group: true,
    startkey: [minDate] , 
    endkey: [now.getTime(), '\\uFFFF']
  }));  
};

API.prototype.notificationsChanges = function(callback) {  
  var changes = this.db.changes(null, {
    filter: 'teamfm-core/notifications',
    include_docs: true,
    heartbeat: 10000
  });
  
  changes.onChange(function(response) {
    response.results.forEach(function(result) {
      callback(result.doc);
    });
  });
  
  return changes;
};

// Extension part
(function() {
  var api = new API(CONFIG),
      bouncingIcon = $.bouncingIcon();

  var TRIM_META_PATTERN_START = /^(\[[^\[]+\]|@[\w\d-_]+|#[\w\d-_]+|\s)+/gi,
      TRIM_META_PATTERN_END = /(\[[^\[]+\]|@[\w\d-_]+|#[\w\d-_]+|\s)+$/gi,
      tagsList = 'new inprogress finished delivered cancelled'.split(' ');

  function trimMeta(body) {
    return body && body.replace(TRIM_META_PATTERN_START, "").replace(TRIM_META_PATTERN_END, "");
  }

  api.init(function() {
    function refreshCount() {
      api.getNotifications({
        success: function(response) {
          setBadgeCount(response.rows.reduce(function(total, row){
            return total +
                ((row.key[1] == 'projects' || row.key[1] == 'teams' ||
                  row.key[1] == 'locations') ?
                                (parseInt(row.value) || 0)
                                :
                                0);
          }, 0));
        }
      });
    }
    
    api.notificationsChanges(function(notification) {
      refreshCount();
      
      // Do not show notification when marking as viewed
      if (!notification || notification.viewed_at) return;
      if (!notification.ref) return;

      if (notification.ref.tags &&
          tagsList.indexOf(notification.ref.tags[0]) != -1 &&
          !trimMeta(notification.ref.body)) {
        return;
      }

      $.notification(notification);
    });
    
    refreshCount();
    
  });
  
  function setBadgeCount(count) {
    // Do not bounce if number wasn't changed
    if (count == setBadgeCount.oldCount) return;
    
    setBadgeCount.oldCount = count;
    
    if (count == parseInt(count)) {
      chrome.browserAction.setBadgeBackgroundColor({
        color: [167, 203, 2, 255]
      });
      
      chrome.browserAction.setBadgeText({
        text: (count || 0).toString()
      });
    } else {
      chrome.browserAction.setBadgeBackgroundColor({
        color: [207, 70, 45, 255]
      });      
      chrome.browserAction.setBadgeText({
        text: '...'
      });
    }
    
    bouncingIcon.bounce();
  }
  
  setBadgeCount('offline');
  
  // Open tadagraph window on click
  chrome.browserAction.onClicked.addListener(function() {
    chrome.tabs.create({
      url: CONFIG.HOST
    });
  });
})();
