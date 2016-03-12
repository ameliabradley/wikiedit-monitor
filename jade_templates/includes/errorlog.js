function processComment (strComment) {
   strComment = strComment.replace(/\[\[([^\]\|]+)\|([^\]\|]+)\]\]/g,
      '<a href="http://en.wikipedia.org/wiki/$1">$2</a>');
   strComment = strComment.replace(/\[\[([^\]\|]+)\]\]/g,
      '<a href="http://en.wikipedia.org/wiki/$1">$1</a>');
   return strComment;
}

$(document).ready(function() {
    $('.typeFooter, .titleFooter, .userFooter, .commentFooter').each( function () {
        var title = $(this).text();
        $(this).html( '<input type="text" placeholder="Search '+title+'" />' );
    } );

    var table = $('#errorlog').DataTable( {
        processing: true,
        serverSide: true,
        ajax: "/?errorlogquery=1",
        columns: [
            { data: "type",
               render: function (data, type, row, meta) {
                  var aReturn = [data, "<br><span class='nobreak'>"];
                  if (row.revision.new) {
                     var bDiffWasLogged = true; // TODO

                     if (bDiffWasLogged) {
                        aReturn = aReturn.concat([
                           "<a href='?diff=", row.revision.new, "&wiki=", row.wiki,
                           "'>logged diff</a>",
                        ]);
                     } else {
                        aReturn = aReturn.concat(["diff not logged"]);
                     }

                     aReturn = aReturn.concat([
                        " | <a href='https://", row.wiki,
                        ".wikipedia.org/w/api.php?action=query&prop=revisions&format=json&rvdiffto=prev&revids=", row.revision.new, "'>wikipedia diff</a></span>"
                     ]);
                  } else {
                     aReturn = aReturn.concat(["no revision #</span>"]);
                  }

                  return aReturn.join("");
               },
               orderable: false }, // Diff
            { data: "created", orderable: false, className: "nobreak" }, // Timestamp
            { data: "title",
               render: function (data, type, row, meta) {
                  var aReturn = [row.title, "<br><span class='nobreak'>"];
                  if (row.count === 0) {
                     aReturn = aReturn.concat(['0 logged page edits | ']);
                  } else {
                     aReturn = aReturn.concat(['<a href="?title=', encodeURIComponent(row.title), '&wiki=', row.wiki, '">', row.count, ' logged page edit(s)</a> | ']);
                  }

                  aReturn = aReturn.concat(['<a href="https://', row.wiki, '.wikipedia.org/w/index.php?action=history&title=', encodeURIComponent(row.title), '">wikipedia edits</a></span>']);

                  return aReturn.join("");
               },
               orderable: false }, // Title
            { data: "user",
               render: function (data, type, row, meta) {
                  if (row.user) {
                     var aReturn = [row.user, "<br>"];

                     var bLoggedUserEdits = true;
                     if (bLoggedUserEdits) {
                     } else {
                     }

                     aReturn = aReturn.concat(['<a class="nobreak" href="https://', row.wiki, '.wikipedia.org/wiki/User:', row.user, '">user page</a>']);

                     return aReturn.join("");
                  } else {
                     return "";
                  }
                  return data;
               },
               orderable: false }, // User
            { data: "comment",
               render: function (data, type, row, meta) {
                  return processComment(data);
               },
               orderable: false } // Comment
        ]
    } );

 
    // Apply the search
    table.columns().every( function () {
        var that = this;
 
        $( 'input', this.footer() ).on( 'keyup change', function () {
            if ( that.search() !== this.value ) {
                that
                    .search( this.value )
                    .draw();
            }
        } );
    } );
} );
