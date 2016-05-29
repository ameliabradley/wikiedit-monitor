function DataPublisher(config, subscribers, dataProcessor) {
    this._url = config.url;
    this._timeRange = config.timeRange || (60*60);
    this._timeout = config.timeout;
    this._subscribers = subscribers || [];
    this._dataProcessor = dataProcessor || ((d) => d);
}

DataPublisher.prototype.addSubscriber = function(subscriber){
    this._subscribers.push(subscriber);
};

DataPublisher.prototype._notifySubscribers = function(data){
    data = this._dataProcessor(data);
    for(var sub of this._subscribers) {
        sub(data);
    }
};

DataPublisher.prototype.startPolling = function(){
    var that = this;
    var endTime = ((new Date()).getTime()/1000).toFixed(0);
    var startTime = endTime - this._timeRange; // minus one hour

    var urlPrefix;
    if(this._url.indexOf('?') === -1) {
        urlPrefix = '?'
    } else {
        urlPrefix = '&'
    }
    d3.json(
        this._url + urlPrefix
            + 'time_start=' + startTime
            + '&time_end=' + endTime,
        function(error, data){
            if( ! error) {
                that._notifySubscribers(data);
            }

            setTimeout(function(){
                that.startPolling();
            }, that._timeout);
        }
    );
};

function ChangesGraph(xFieldTitle, yFieldTitle, fieldPath) {
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

    this._xFieldTitle = xFieldTitle || 'Changes in Past Hour';
    this._yFieldTitle = yFieldTitle;

    var pathParts = fieldPath.split('.');
    this._fieldFunction = (d) => {
        var con = d;
        for(var i of pathParts) {
            if(i in con) {
                con = con[i];
            } else {
                return undefined;
            }
        }
        return con;
    };
}

ChangesGraph.prototype.loadGraph = function(container){
    container.append('h3')
        .classed('chart_title', true)
        .text('Most Active ' + this._yFieldTitle + 's');

    this._svg = svg = container.append('svg');

    svg.attr('width', this._fullWidth);
    svg.attr('height', this._fullHeight);

    var chart = new dimple.chart(svg, []);
    chart.setBounds(this._margin.left, this._margin.top, this._width, this._height);
    chart.eash = 'sin';
    this._chart = chart;

    var yAxis = chart.addCategoryAxis('y', 'val');
    yAxis.title = this._yFieldTitle;
    yAxis.addOrderRule('cnt');
    this._yAxis = yAxis;

    var xAxis = chart.addMeasureAxis('x', 'cnt');
    xAxis.tickFormat = d3.format(',.1f');
    xAxis.title = this._xFieldTitle;
    this._xAxis = xAxis;
    chart.addSeries(null, dimple.plot.bar);
};

ChangesGraph.prototype.updateGraph = function(result){
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
                    n[fieldVal] = { cnt: 1, val: fieldVal };
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

// d3.json('/?dash_config=1', function(err, data){
(function(err, data){
    var err = null;
    if(err) {
        alert('Error - could not show dashboard. See log for more details.');
        throw err;
    }

    var config = data.config;
    
    if(config && config.graphList && config.graphList.length) {
        if( ! window.graphList) window.graphList = {};

        var mainGraph = d3.select('#main_graph_area');
        var graphSubList = [];
        for(var gi in config.graphList) {
            var graph = config.graphList[gi],
                type = graph.type.split('.'),
                gClass = window;

            for(var i in type) {
                gClass = gClass[type[i]];
            }

            var chartElement = mainGraph.append('div').classed('chart', true);
            var argsCopy = graph.arguments.slice();
            argsCopy.unshift(null)
            var newGraph = new (Function.prototype.bind.apply(gClass, argsCopy));
            newGraph.loadGraph(chartElement);
            graphSubList.push(newGraph.updateGraph.bind(newGraph));
            window.graphList['graph_' + gi] = newGraph;
        }
        var publisher = new DataPublisher({
            url: '/?dash_socketdata=1',
            timeout: 5000,
            timeRange: (60*60*24)
        },graphSubList, (data) => {
            data.data.forEach((d) => d.message.comment = d.message.comment || '(Empty)')
            return data;
        });
        publisher.startPolling();
        d3.select('#create_graph_button').on('click', function(){
            var graphE = d3.select('#add_graph');

            var type = graphE.select('#GraphType').property('value').split('.'),
                gClass = window;

            for(var i in type) {
                gClass = gClass[type[i]];
            }

            var chartElement = mainGraph.insert('div', ':first-child').classed('chart', true);
            var args = [
                null,
                graphE.select('#XTitle').property('value'),
                graphE.select('#YTitle').property('value'),
                'message.' + graphE.select('#fieldPath').property('value')
            ];
            var newGraph = new (Function.prototype.bind.apply(gClass, args));
            newGraph.loadGraph(chartElement);
            graphSubList.push(newGraph.updateGraph.bind(newGraph));
            gi += 1;
            window.graphList['graph_' + gi] = newGraph;
        });
    }
}(
    null,
    {
        config: {
            graphList: [
                {type: 'ChangesGraph', arguments: ['Changes in Past 24 Hours', 'Article','message.title'] },
                {type: 'ChangesGraph', arguments: ['Changes in Past 24 Hours', 'User','message.user'] },
                {type: 'ChangesGraph', arguments: ['Changes in Past 24 Hours', 'Action Type','message.type'] },
                {type: 'ChangesGraph', arguments: ['Changes in Past 24 Hours', 'Comment','message.comment'] }
            ]
        }
    }
));
