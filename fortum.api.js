'use strict';

const moment = require('moment');
const request = require('request');
const cheerio = require('cheerio');
const  url = require('url');
const debug = require('debug')('fortum.api');
const debugC = require('debug')('fortum.content');

// Valpas is currently using these URL's and forms as 03/2019
const valpasPortal = 'https://www.fortum.com/valpas';
const loginFormID = 'usernameLogin4';

/* Login to Fortum Valpas. 
 *
 * Arguments: 
 * - username and password. Valid credientials for Valpas service
 * - callback(error). Function called when login done. Error set to non-null if login fails.
 * 
 * Current process as 03/2019 (ignoring automatic redirects done by request).
 * Will be broken if Fortum changes anything. Waiting for proper API to utilize.
 * 
 * 1) Fetch valpas portal page
 * 2) Meta redirect to login page via page content
 * 3) Post login form. Filled with username/password, other form data + some wicket fields (set manually by code). Also some extra headers had to be set
 * 4) Redirect processing from ajax-location -header
 * 5) Meta redirect by page content
 * 5) Yet another meta redirect by page content
 * 6) Finally there. Authenticated and authorized, api open and usable
 *
 */ 
exports.login = function login(username, password, callback){
    debug('Opening portal page:', valpasPortal);

    request.get({ url: valpasPortal, jar: true, debug: false, followAllRedirects: true }, (error, response, body) => {
	if(error){
	    callback(Error('ERROR: Portal not available at: ' + valpasPortal + ' ' + error));
	    return;
	}
	
	//	debug('Response: ', response);
	debug('Got status code:', response.statusCode);
	debugC('Body:', body);
	// There should be meta refresh in this reply
	debug("There should be meta redirect.");
	const reurl = redirectURL(body);

	if(reurl == undefined){
	    callback(Error('ERROR: Something has changed. Did not get meta redirect when expected!'));
	    return;
	}
	var rebaseurl = url.resolve(response.request.uri.href, reurl);
	
	request.get({ url: rebaseurl, jar: true, debug: false, followAllRedirects: true }, (error, response, body) => {
	    debug('Loading redirected page: ', rebaseurl);
	    if(error){
		callback(Error('Redirect failed: ' + error));
		return;
	    }
	    debug('Got status code:', response && response.statusCode);
	    debugC('Body:', body);
	    debug('Search login form: ', loginFormID);
	    
	    const $ = cheerio.load(body);
	    // Search login form
	    var loginForm = $('form[id=' + loginFormID + ']');
	    var inputFields = $( 'input', loginForm);
	    var formData = {};
	    var action;
		    
	    if(loginForm === undefined){
		callback(Error('No login form found. Something has changed....'));
		return;
	    }

	    debug('Form found. OK. Processing fields.');
	    action = loginForm[0].attribs.action;
			
	    for( var i2 = 0, l2 = inputFields.length; i2 < l2; i2 ++ ){
		var inputField = inputFields[ i2 ];
		debug("Input: ", inputField.attribs.name, '=', inputField.attribs.value);
		if(inputField.attribs.value != undefined){
		    debug("Storing input value: ", inputField.attribs.name, '=', inputField.attribs.value);
		    formData[inputField.attribs.name] = inputField.attribs.value;
		}
	    }
	    debug("Parsed form inputs: ", formData);

	    if(formData.ttqusername === undefined || formData.userPassword === undefined){
		callback(Error('Form input fields unrecongnized. No user/pass'));
		return;
	    }
	    /* Sample form data to be used
	       
	      csrf_token_usernamelogin: 46cb632b-8739-409e-9800-cda56319024f
	      usernameLogin4_hf_0:
	      ttqusername: username
	      userPassword: password
	      userIDPanel:loginWithUserID: 1
	    */
	    // Replace form data with real username/password combo
	    formData['ttqusername'] = username;
	    formData['userPassword'] = password;
	    // This seems to be added somehow by wicket??? Adding them manually here for sure, don't know if required or not.
	    
	    // Extra headers. Set by wicket code or browser. Adding all of them here manually. Don't really know if they all are needed?
	    var extraHeaders = { 
		'Wicket-Ajax': 'true',
		'Wicket-Ajax-BaseURL': 'login',
		'Wicket-FocusedElementId': 'loginWithUserID5',
		'X-Requested-With': 'XMLHttpRequest',
		// These did the job. Had to set manually
		'Origin': 'https://login.fortum.com',
		'Referer': 'https://login.fortum.com/portal/login'
	    };

	    // Strange, form action won't work, something to do with wicket? Setting manually now 
	    //	    	    var loginURL = url.resolve('https://login.fortum.com/portal/', action);
	    debug('*** Form action check: ', action, ' vs ', 'login?2-1.IBehaviorListener.0-userIDPanel-loginWithUserID');
	    var loginURL = url.resolve(response.request.uri.href, 'login?2-1.IBehaviorListener.0-userIDPanel-loginWithUserID');
	    debug("Post login form with real user data: ", loginURL, " form: ", formData);
	    
	    request.post({ url: loginURL, jar: true, headers: extraHeaders, json: false, form: formData, followAllRedirects: true }, (error, response, body) => {
		if(error){
		    callback(Error('Error: post login form failed. ' + error));
		    return;
		}

		debug('Got status code:', response && response.statusCode);
		debugC('Body:', body);
		debug('Searching for ajax-header for redirect');

		// Redirect by ajax...
		if(response.headers['ajax-location'] == undefined){
		    callback(Error('Expected ajax-location header. Something has changed or login failed for user: ' + username));
		    return;
		}

		debug('Get ajax redirect to: ', response.headers['ajax-location']);
		var rebaseurl = url.resolve(response.request.uri.href, response.headers['ajax-location']);

		request.get({ url: rebaseurl, jar: true, json: false, followAllRedirects: true }, (error, response, body) => {
		    if(error){
			callback(Error('Ajax redirect failed:' + error));
			return;
		    }

		    debug('Got status code:', response && response.statusCode);
		    debugC('Body:', body);
		    // Still one meta refresh....
		    debug("There should be another meta redirect... search");
		    const reurl = redirectURL(body);
		    if(reurl == undefined){
			callback(Error('No meta redirect when expected. Something has changed'));
			return;
		    }
		    
		    var rebaseurl = url.resolve(response.request.uri.href, reurl);

		    request.get({ url: rebaseurl, jar: true, debug: false, followAllRedirects: true }, (error, response, body) => {
			if(error){
			    callback(Error('Meta redirect failed:' + error));
			    return;
			}

			debug('Got status code:', response && response.statusCode);
			debugC('Body:', body);
			
			// Still one meta refresh....
			// There should be meta refresh in this reply
			debug("There should be yet another meta redirect... search");
			const reurl = redirectURL(body);
			if(reurl == undefined){
			    callback(Error('No meta redirect when expected. Something has changed'));
			    return;
			}
			var rebaseurl = url.resolve(response.request.uri.href, reurl);
			request.get({ url: rebaseurl, jar: true, debug: false, followAllRedirects: true }, (error, response, body) => {
			    if(error){
				callback(Error('Meta redirect failed:' + error));
				return;
			    }
			    debug('Got status code:', response && response.statusCode);
			    debugC('Body:', body);
			    debug("Login OK... Time to get data");
			    
			    // Finally there.... Ready for business
			    callback(null);
			});
		    });
		});
	    });
	});
    });
}

exports.getConsumption = function(customer, starttime, endtime, callback){
    // Sample URL to get consumption
    //    https://valpas.fortum.fi/valpas/api/v3-2/meteringPoints/ELECTRICITY/6897175/series?_=1551870821952&baseRateInAllResolutions=false&companyAssociation=NETWORK&customerNumber=1234567&endDate=2019-03-04T23:59:59%2B0200&productAssociations=NETWORK,SALES,WHOLESALE&products=EL_ENERGY_CONSUMPTION&resolution=DAYS_AS_HOURS&startDate=2019-03-04T00:00:00%2B0200&tariffDivision=false&tariffRuleSource=NETWORK
    const consumptionQueryURL = 'https://www.fortum.com/valpas/api/v3-2/meteringPoints/ELECTRICITY/6897175/series';
    const start = moment(starttime).format('YYYY-MM-DDTHH:mm:ss+0000');
    const end = moment(endtime).format('YYYY-MM-DDTHH:mm:ss+0000');
    
    var consumptionParams = {
	'_': moment().unix()*1000,
	'baseRateInAllResolutions': 'false',
	'companyAssociation': 'NETWORK',
	'customerNumber': customer,
	'startDate': start,
	'endDate': end,
	'productAssociations': 'NETWORK,SALES,WHOLESALE',
	'products': 'EL_ENERGY_CONSUMPTION',
	'resolution': 'DAYS_AS_HOURS',
	'tariffDivision': 'false',
	'tariffRuleSource': 'NETWORK'
    }
    
    request.get({ url: consumptionQueryURL, qs: consumptionParams, jar: true, debug: false }, (error, response, body) => {
	if(error){
	    callback(Error('ERROR:', error));
	    return
	}
	else{
	    debug('Got status code:', response && response.statusCode);
	    debugC('Body:', body);
	    debug('Got consumption data. OK');

	    const json = JSON.parse(body);

	    callback(null, json);
	}
    });
}

exports.getPrices = function getPrices(customer, starttime, endtime, callback){
    // Sample URL to get prices
    // https://valpas.fortum.fi/valpas/api/v3-2/meteringPoints/PRICE/SPOT_PRICE%23TART/series?_=1551870821950&baseRateInAllResolutions=false&companyAssociation=NETWORK&customerNumber=1234567&endDate=2019-03-04T23:59:59%2B0200&productAssociations=NETWORK,SALES,WHOLESALE&products=PRICE&resolution=DAYS_AS_HOURS&startDate=2019-03-04T00:00:00%2B0200&tariffDivision=false&tariffRuleSource=NETWORK
    
    const pricesQueryURL = 'https://valpas.fortum.fi/valpas/api/v3-2/meteringPoints/PRICE/SPOT_PRICE%23TART/series';
    const start = moment(starttime).format('YYYY-MM-DDTHH:mm:ss+0000');
    const end = moment(endtime).format('YYYY-MM-DDTHH:mm:ss+0000');
    
    var priceParams = {
	'_': moment().unix()*1000,
	'baseRateInAllResolutions': 'false',
	'companyAssociation': 'NETWORK',
	'customerNumber': customer,
	'startDate': start,
	'endDate': end,
	'productAssociations': 'NETWORK,SALES,WHOLESALE',
	'products': 'PRICE',
	'resolution': 'DAYS_AS_HOURS',
	'tariffDivision': 'false',
	'tariffRuleSource': 'NETWORK'
    }

    console.log('params: ', priceParams);
    
    request.get({ url: pricesQueryURL, qs: priceParams, jar: true, debug: false }, (error, response, body) => {
	if(error){
	    callback(Error('ERROR:', error));
	    return;
	}
	else{
	    debug('Got price data. OK');
	    debug('Got status code:', response && response.statusCode);
	    debugC('Body:', body);

	    const json = JSON.parse(body);
	    callback(null, json);
	}
    });
}

exports.logout = function logout(){
    // TODO
    debug('logout. Now done yet');
}


/*
 * Returns url if passed body contains meta tag with refresh attribute
 */
function redirectURL(body){
    debugC('Check for meta redirect from body: ', body);
    
    const $ = cheerio.load(body);
    const refresh = $('meta[http-equiv="refresh"]').attr("content");

    if(refresh === undefined){
	debug('No meta refresh found from body');
	return undefined;
    }
    
    // Refresh pattern should match [timeout;URL=url]
    const pattern = /^\s*(\d+)(?:\s*;(?:\s*url\s*=)?\s*(.+)?)?$/i;
    const url = pattern.exec(refresh);

    if(url === undefined){
	debug('Malformated meta refresh content');
	return undefined;
    }
    else{
	debug('Got meta redirect to :', url[2]);
	return url[2];
    }
};
