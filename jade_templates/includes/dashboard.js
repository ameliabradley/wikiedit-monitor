
function WikiEditDashboard() {
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

    this._container = d3.select('#socket_graph')
}

WikiEditDashboard.SOCKETDATA_URL = '/?dash_socketdata=1';
WikiEditDashboard.SOCKET_GRAPH_TIMEOUT = 5000;

WikiEditDashboard.prototype.loadSocketGraph = function(){
    this._container.append('h3')
        .classed('chart_title', true)
        .text('Most Active Articles (past hour)');

    this._svg = svg = this._container.append('svg');

    svg.attr('width', this._fullWidth);
    svg.attr('height', this._fullHeight);

    var chart = new dimple.chart(svg, []);
    chart.setBounds(this._margin.left, this._margin.top, this._width, this._height);
    chart.eash = 'sin';
    this._chart = chart;

    var yAxis = chart.addCategoryAxis('y', 'title');
    yAxis.title = 'Article';
    yAxis.addOrderRule('cnt');
    this._yAxis = yAxis;

    var xAxis = chart.addMeasureAxis('x', 'cnt');
    xAxis.tickFormat = d3.format(',.1f');
    xAxis.title = 'Changes in Past Hour';
    this._xAxis = xAxis;
    chart.addSeries(null, dimple.plot.bar);

    var that = this;
    (function triggerUpdateGraph(){
        d3.json(WikiEditDashboard.SOCKETDATA_URL, function(error, data){
            if(error) {
                setTimeout(triggerUpdateGraph, WikiEditDashboard.SOCKET_GRAPH_TIMEOUT);
            } else {
                that.updateSocketGraph(data)
            }
        });
    }());
};

WikiEditDashboard.prototype.updateSocketGraph = function(result){
    var socketData = result.data;
    var reducedData = socketData.reduce((n,d) => {
            if(d.message.title in n)
            {
                    n[d.message.title].cnt += 1;
            }
            else
            {
                    d.message.cnt = 1;
                    n[d.message.title] = d.message;
            }
            return n;
    }, {});

    socketData = [];
    for(var z of Object.keys(reducedData))
    {
            socketData.push(reducedData[z]);
    }

    socketData = socketData.sort((a,b) => b.cnt - a.cnt).slice(0, 20);

    this._xAxis.ticks = d3.max(socketData, (d) => d.cnt);

    this._chart.data = socketData;
    this._chart.draw(1000);

    var that = this;
    setTimeout(function triggerUpdateGraph(){
        d3.json(WikiEditDashboard.SOCKETDATA_URL, function(error, data){
            if(error) {
                setTimeout(triggerUpdateGraph, WikiEditDashboard.SOCKET_GRAPH_TIMEOUT);
            } else {
                that.updateSocketGraph(data)
            }
        });
    }, WikiEditDashboard.SOCKET_GRAPH_TIMEOUT);
};

var dashboard = new WikiEditDashboard();
dashboard.loadSocketGraph();
