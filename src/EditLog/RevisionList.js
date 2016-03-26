"use strict";
var revLists = new WeakMap();
class RevisionList {
  constructor() {
    revLists.set(this, {
      revisions:[],
      reservedRevisions:[],
      dataByRevId:{},
      releaseCountByRevId:{}
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
    for(var revnew of revIdList) {
      this.releaseRevision(revnew);
    }
  }
  releaseRevision(revId) {
    revId = parseInt(revId);
    var od = revLists.get(this);
    var reservedIndex = od.reservedRevisions.indexOf(revId);
    if(reservedIndex !== -1) {
      od.reservedRevisions.splice(reservedIndex, 1);
      od.revisions.push(revId);
      if(revId in od.releaseCountByRevId) {
        od.releaseCountByRevId[revId]++;
      } else {
        od.releaseCountByRevId[revId] = 1;
      }
    }
  }
  purgeRevision(revId) {
    revId = parseInt(revId);
    var od = revLists.get(this);
    delete od.dataByRevId[revId];
    delete od.releaseCountByRevId[revId];

    var reservedIndex = od.reservedRevisions.indexOf(revId);
    if(reservedIndex !== -1) {
      od.reservedRevisions.splice(reservedIndex, 1);
    }

    var revIndex = od.revisions.indexOf(revId);
    if(revIndex !== -1) {
      od.revisions.splice(reservedIndex, 1);
    }
  }
}

module.exports = RevisionList;
