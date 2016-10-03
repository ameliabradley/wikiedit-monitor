"use strict";
var revLists = new WeakMap();
class RevisionList {
  constructor() {
    revLists.set(this, {
      revisions: [],
      reservedRevisions: [],
      dataByRevId: {},
      releaseCountByRevId: {},
      purgeOnRelease: []
    });
  }
  get count() {
    return revLists.get(this).revisions.length;
  }
  get revisions() {
    return revLists.get(this).revisions;
  }
  get reservedRevisions() {
    return revLists.get(this).reservedRevisions;
  }
  addRevision(revId, data) {
    revId = parseInt(revId);
    var od = revLists.get(this);
    od.revisions.push(revId);
    od.dataByRevId[revId] = data;
  }
  hasRevision(revId) {
    revId = parseInt(revId);
    return this.revisions.indexOf(revId) !== -1;
  }
  getRevisionData(revId) {
    revId = parseInt(revId);
    var od = revLists.get(this);
    return od.dataByRevId[revId];
  }
  getReleaseCount(revId) {
    revId = parseInt(revId);
    var od = revLists.get(this);
    return od.releaseCountByRevId[revId];
  }
  reserveRevisions(maxCount) {
    var od = revLists.get(this);
    od.reservedRevisions = od.revisions.splice(0, maxCount);
    return od.reservedRevisions;
  }
  releaseRevisions(revIdList) {
    for (var revnew of revIdList) {
      this.releaseRevision(revnew);
    }
  }
  releaseRevision(revId) {
    revId = parseInt(revId);
    var od = revLists.get(this);
    var reservedIndex = od.reservedRevisions.indexOf(revId);
    if (reservedIndex !== -1) {
      od.reservedRevisions.splice(reservedIndex, 1);
      od.revisions.push(revId);
      if (revId in od.releaseCountByRevId) {
        od.releaseCountByRevId[revId]++;
      } else {
        od.releaseCountByRevId[revId] = 1;
      }
    }
    if(od.purgeOnRelease[revId]) {
       this.purgeRevision(revId);
    }
  }
  purgeOnRelease(revId) {
    revId = parseInt(revId);
    var od = revLists.get(this);
    if(od.revisions.indexOf(revId) === -1){
       od.purgeOnRelease[revId] = true;
    } else {
       this.purgeRevision(revId);
    }
  }
  purgeRevision(revId) {
    revId = parseInt(revId);
    var od = revLists.get(this);
    delete od.dataByRevId[revId];
    delete od.releaseCountByRevId[revId];
    delete od.purgeOnRelease[revId];

    var reservedIndex = od.reservedRevisions.indexOf(revId);
    if (reservedIndex !== -1) {
      od.reservedRevisions.splice(reservedIndex, 1);
    }

    var revIndex = od.revisions.indexOf(revId);
    if (revIndex !== -1) {
      od.revisions.splice(reservedIndex, 1);
    }
  }
}

module.exports = RevisionList;
