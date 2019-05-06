## Simple node api to fetch electricity consumption data from Fortum Valpas service

Requires that you have a customer agreement with Fortum and know your customer ID and you have been registered to Valpas service

API provides the following methods:

```
fortum.login(username, password);
fortum.getConsumption(customerID, starttime, endtime);
fortum.getPrices(customerID, starttime, endtime);

// Prices for a week
fortum.getPrices('1234567', moment().startOf('day').subtract(7, 'days'), moment().endOf('day').subtract(1, 'days'), (err, json) => {});

// Consumption for a day
fortum.getPrices('1234567', moment().startOf('day').subtract(1, 'days'), moment().endOf('day').subtract(1, 'days'), (err, json) => {});
```

Returns measurement data in json or an error

## Sample

Login to service and fetch yesterdays consumption 

```
const fortum = require('./fortum.api.js');

fortum.login('mr', 'fortum', (err) => {
  if(err){
    console.error('Login failed: ', err);
  }
  else{
    fortum.getConsumption('1234567', moment().startOf('day').subtract(1, 'days'), moment().endOf('day').subtract(1, 'days'), (err, json) => {
      if(err){
      	console.error('Consumption failed: ', err);
      }
      else{
	console.log('Consumption', JSON.stringify(json));
      }
    });
  }
});
```

