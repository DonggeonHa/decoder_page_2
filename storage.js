var DB_NAME = "FILE_QR_DECODER_DB";
var DB_VERSION = 1;
var STORE_NAME = "FILE_QR_COLLECTOR_STATE";
var STATE_KEY = "active";

function openDatabase() {
  return new Promise(function (resolve, reject) {
    if (!("indexedDB" in window)) {
      reject(new Error("IndexedDB is not available."));
      return;
    }

    var request = indexedDB.open(DB_NAME, DB_VERSION);

    request.onupgradeneeded = function () {
      var db = request.result;
      if (!db.objectStoreNames.contains(STORE_NAME)) {
        db.createObjectStore(STORE_NAME);
      }
    };

    request.onsuccess = function () {
      resolve(request.result);
    };

    request.onerror = function () {
      reject(request.error || new Error("IndexedDB open failed."));
    };
  });
}

function withStore(mode, callback) {
  return openDatabase().then(function (db) {
    return new Promise(function (resolve, reject) {
      var transaction = db.transaction(STORE_NAME, mode);
      var store = transaction.objectStore(STORE_NAME);
      var request;

      try {
        request = callback(store);
      } catch (error) {
        db.close();
        reject(error);
        return;
      }

      request.onsuccess = function () {
        resolve(request.result);
      };

      request.onerror = function () {
        reject(request.error || new Error("IndexedDB request failed."));
      };

      transaction.oncomplete = function () {
        db.close();
      };

      transaction.onerror = function () {
        db.close();
      };
    });
  });
}

export function loadCollectorState() {
  return withStore("readonly", function (store) {
    return store.get(STATE_KEY);
  });
}

export function saveCollectorState(state) {
  return withStore("readwrite", function (store) {
    return store.put(state, STATE_KEY);
  });
}

export function clearCollectorState() {
  return withStore("readwrite", function (store) {
    return store.delete(STATE_KEY);
  });
}
