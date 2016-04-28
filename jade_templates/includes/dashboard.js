function DataPublisher(config, subscribers) {
    this._url = config.url;
    this._timeout = config.timeout;
    this._subscribers = subscribers || [];
}

DataPublisher.prototype.addSubscriber = function(subscriber){
    this._subscribers.push(subscriber);
};

DataPublisher.prototype._notifySubscribers = function(data){
    for(var sub of this._subscribers) {
        sub(data);
    }
};

DataPublisher.prototype.startPolling = function(){
    var that = this;
    d3.json(this._url, function(error, data){
        if( ! error) {
            that._notifySubscribers(data);
        }

        setTimeout(function(){
            that.startPolling();
        }, that._timeout);
    });
};

function ChangesGraph(containerId, fieldTitle, fieldFunction) {
    this._margin = {
        top: 10,
        left: 300,
        bottom: 75,
        right: 75
    };

    this._fullHeight = 600;
    this._fullWidth = 900;

    this._height = this._fullHeight - this._margin.top - this._margin.bottom;
    this._width = this._fullWidth - this._margin.left - this._margin.right;

    this._fieldTitle = fieldTitle;
    this._fieldFunction = fieldFunction;
    this._container = d3.select(containerId)
}

ChangesGraph.prototype.loadSocketGraph = function(){
    this._container.append('h3')
        .classed('chart_title', true)
        .text('Most Active ' + this._fieldTitle + 's (past hour)');

    this._svg = svg = this._container.append('svg');

    svg.attr('width', this._fullWidth);
    svg.attr('height', this._fullHeight);

    var chart = new dimple.chart(svg, []);
    chart.setBounds(this._margin.left, this._margin.top, this._width, this._height);
    chart.eash = 'sin';
    this._chart = chart;

    var yAxis = chart.addCategoryAxis('y', 'title');
    yAxis.title = this._fieldTitle;
    yAxis.addOrderRule('cnt');
    this._yAxis = yAxis;

    var xAxis = chart.addMeasureAxis('x', 'cnt');
    xAxis.tickFormat = d3.format(',.1f');
    xAxis.title = 'Changes in Past Hour';
    this._xAxis = xAxis;
    chart.addSeries(null, dimple.plot.bar);
};

ChangesGraph.prototype.updateSocketGraph = function(result){
    var fieldFunction = this._fieldFunction;
    var socketData = result.data;
    var reducedData = socketData.reduce((n,d) => {
            var fieldVal = fieldFunction(d);
            if(fieldVal in n)
            {
                    n[fieldVal].cnt += 1;
            }
            else
            {
                    d.message.cnt = 1;
                    n[fieldVal] = d.message;
            }
            return n;
    }, {});

    socketData = [];
    for(var z of Object.keys(reducedData))
    {
            socketData.push(reducedData[z]);
    }

    socketData = socketData.sort((a,b) => b.cnt - a.cnt).slice(0, 20);

    this._xAxis.ticks = Math.min(d3.max(socketData, (d) => d.cnt), 15);

    this._chart.data = socketData;
    this._chart.draw(1000);
};

var mostActiveArticles = new ChangesGraph('#active_articles', 'Article', (d) => d.message.title);
mostActiveArticles.loadSocketGraph();

var mostActiveUsers = new ChangesGraph('#active_users', 'User', (d) => d.message.user);
mostActiveUsers.loadSocketGraph();

var publisher = new DataPublisher({
    url: '/?dash_socketdata=1',
    timeout: 5000
},[
    function(data){
        mostActiveArticles.updateSocketGraph(data);
    },
    function(data){
        mostActiveUsers.updateSocketGraph(data);
    }
]);
publisher.startPolling();
