var aws = require('aws-sdk');
var ddb = new aws.DynamoDB({params: {TableName: 'SesSuppressionList-Copy'}});
var getEmails = require('get-emails');

function stripThans(item, callback) {
  if(item.indexOf('<')==0 && item.indexOf('>')==item.length-1) {
    item=item.substring(1,item.length-1);
  }
  return item;
} //stripThans

function sanitizeEmail(item, callback) {
  item=stripThans(getEmails(item)[0]);  //getEmails returns array, but we're only feeding single recipients
  return item;
} //sanitizeEmails

function putSuppressedItem(items, callback) {
  for(var j=0, lenj=items.length; j<lenj; j++) {
    ddb.putItem(items[j], function(err,data) {
      if (err) {
        console.log('error','putting item in dynamodb failed: '+err);
      } else {
        console.log('great success: '+JSON.stringify(data, null, '  '));
        context.done(null,'');
      }
    });
  }
} //putSuppressedItem

function scanSesFailedTarget(ExclusiveStartKey, callback) {
  var params = {
    TableName: 'SesSuppressionList-Copy',
    KeyConditionExpression: "contains(#email,:lthan)",
    ExpressionAttributeNames:{
      "#email": "SesFailedTarget"
    },
    ExpressionAttributeValues: {
      ":lthan": "<"
    }
  };
  if(ExclusiveStartKey) params.ExclusiveStartKey = ExclusiveStartKey;
  console.log("Scanning SesSuppressionList-Copy");  //DEBUG
  ddb.scan(params, callback);
} // scanSesFailedTarget

function onScan(err, data) {
  if (err) {
    console.error("Unable to scan the table. Error JSON: ", JSON.stringify(err, null, 2));
  } else {
    console.log("Scan succeeded. Items returned: "+data.Count);
    data.Items.forEach(function(email) {
      console.log( JSON.stringify(email, null, 2));
    });
  }
}

scanSesFailedTarget(null, onScan);
