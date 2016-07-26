'use strict';
var Observer = require('./observer');
var LiveApi = require('binary-live-api').LiveApi;

var CustomApi = function CustomApi(websocketMock) {
	var option = {};
	this.observer = new Observer();
	if ( typeof window !== 'undefined' ) {
		var storageManager = require('./storageManager');
		option = {
			language: storageManager.get('lang'),
			appId: storageManager.get('appId'),
		};
	}
	if ( typeof WebSocket === 'undefined' ) {
		if ( websocketMock ) {
			option.websocket = websocketMock;
		} else {
			option.websocket = require('ws');
		}
	}
	this._originalApi = new LiveApi(option);
	var events = {
		tick: function(){},
		history: function(){
			return this._originalApi.getTickHistory.apply(this._originalApi, Array.prototype.slice.call(arguments));
		},
		proposal_open_contract: function(contract_id){
			return this._originalApi.send({
				proposal_open_contract: 1,
				contract_id: contract_id,
				subscribe: 1
			});
		},
		proposal: function(){
			return this._originalApi.subscribeToPriceForContractProposal.apply(this._originalApi, Array.prototype.slice.call(arguments));
		},
		buy: function(){
			return this._originalApi.buyContract.apply(this._originalApi, Array.prototype.slice.call(arguments));
		},
		authorize: function(){
			return this._originalApi.authorize.apply(this._originalApi, Array.prototype.slice.call(arguments));
		},
		balance: function(){
			return this._originalApi.subscribeToBalance.apply(this._originalApi, Array.prototype.slice.call(arguments));
		},
	};
	var that = this;
	Object.keys(events).forEach(function(e){
		var _event = ((!that.events[e])? that.events._default: that.events[e]).bind(that);
		that._originalApi.events.on(e, _event);
		that[e] = function(){
			var promise = events[e].apply(that, Array.prototype.slice.call(arguments));
			if ( promise instanceof Promise ) {
				promise.then(function resolve(data){
				}, function reject(data){
					_event(data);
				});
			}
		};
	});
};

CustomApi.prototype = Object.create(LiveApi.prototype, {
	apiFailed:{
		value: function apiFailed(response){
			if (response.error) {
				this.observer.emit('api.error', response.error);
				return true;
			}
			return false;
		}
	},
	events: {
		value: {
			tick: function tick(response) {
				if ( !this.apiFailed(response) ) {
					var tick = response.tick;
					this.observer.emit('api.log', 'tick received at: ' + tick.epoch);
					this.observer.emit('api.tick', {
						epoch: +tick.epoch,
						quote: +tick.quote,
					});
					this.observer.emit('api.log', tick);
				}
			},
			history: function history(response) {
				if ( !this.apiFailed(response) ) {
					var ticks = [];
					var history = response.history;
					history.times.forEach(function (time, index) {
						ticks.push({
							epoch: +time,
							quote: +history.prices[index]
						});
					});
					this.observer.emit('api.log', ticks);
					this.observer.emit('api.history', ticks);
				}
			},
			authorize: function authorize(response) {
				if ( !this.apiFailed(response) ) {
					this.observer.emit('api.authorize', response.authorize);
				}
			},
			_default: function _default(response) {
				if ( !this.apiFailed(response) ) {
					var msg_type = response.msg_type;
					this.observer.emit('api.log', response);
					this.observer.emit('api.' + msg_type, response[msg_type]);
				}
			},
		}
	}
});

module.exports = CustomApi;
