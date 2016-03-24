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
    var od = revLists.get(this);
    od.revisions.push(revId);
    od.dataByRevId[revId] = data;
  }
  getRevisionData(revId) {
    var od = revLists.get(this);
    return od.dataByRevId[revId];
  }
  getReleaseCount(revId) {
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
    var od = revLists.get(this);
    var reservedIndex = od.reservedRevisions.indexOf(revId);
    if(reservedIndex !== -1) {
      delete od.reservedRevisions[reservedIndex];
      od.revisions.push(revId);
      if(revId in od.releaseCountByRevId) {
        od.releaseCountByRevId[revId]++;
      } else {
        od.releaseCountByRevId[revId] = 1;
      }
    }
  }
  purgeRevision(revId) {
    var od = revLists.get(this);
    delete od.dataByRevId[revId];
    delete od.releaseCountByRevId[revId];

    var reservedIndex = od.reservedRevisions.indexOf(revId);
    if(reservedIndex !== -1) {
      delete od.reservedRevisions[reservedIndex];
    }

    var revIndex = od.revisions.indexOf(revId);
    if(revIndex !== -1) {
      delete od.revisions[revIndex];
    }
  }
}

module.exports = RevisionList;
