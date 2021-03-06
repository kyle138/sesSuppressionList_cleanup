var ddbOptions = require('./ddbOptions.json');
var aws = require('aws-sdk');
var ddb = new aws.DynamoDB(ddbOptions);
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

function putSanitizedItem(item, callback) {
  console.log("****************************");  //Cleaner output in DEBUG
  var dirtyEmail = item.SesFailedTarget;
  var sanitizedEmail = sanitizeEmail(item.SesFailedTarget.S);
  if(sanitizedEmail == dirtyEmail.S) {
    console.log("Email already sanitized: "+sanitizedEmail+" :: "+dirtyEmail.S);  //DEBUG
  } else {
    console.log("Email needs sanitizing: "+item.SesFailedTarget.S); //DEBUG
    item.SesFailedTarget = {"S": sanitizedEmail};
    var params = {
      TableName: "SesSuppressionList",
      Item: item
    }
    console.log("putItem: "+JSON.stringify(params, null, 2)); //DEBUG
    ddb.putItem(params, function(err,data) {
      if (err) {
        console.error('error','putting item in dynamodb failed: '+err);
      } else {
        console.log('great success: '+JSON.stringify(data, null, 2));
        //context.done(null,'');
          callback(dirtyEmail);
      }
    });
  }
} //putSuppressedItem

function deleteDirtyItem(key, callback) {
  var params = {
    TableName: 'SesSuppressionList',
    Key: {
      "SesFailedTarget": key
    }
  }
  console.log("deleteDirtyItem: "+JSON.stringify(params, null, 2));  //DEBUG

  ddb.deleteItem(params, function(err, data) {
    if (err) {
      console.error('error','Deleting item in dynamodb failed: '+err);
    } else {
      console.log('great success: '+JSON.stringify(data, null, 2));
    }
  });
} // deleteDirtyItem

function scanSesFailedTarget(ExclusiveStartKey, callback) {
  var params = {
    TableName: 'SesSuppressionList',
    FilterExpression: "contains(#email,:lthan)",
    ExpressionAttributeNames:{
      "#email": "SesFailedTarget"
    },
    ExpressionAttributeValues: {
      ":lthan": {"S":"<"}
      //":lthan": {"S":"bounce@simulator.amazonses.com"} //DEBUG
    }
  };
  if(ExclusiveStartKey) params.ExclusiveStartKey = ExclusiveStartKey;
  console.log("Scanning SesSuppressionList");  //DEBUG
  ddb.scan(params, callback);
} // scanSesFailedTarget

function onScan(err, data, callback) {
  if (err) {
    console.error("Unable to scan the table. Error JSON: ", JSON.stringify(err, null, 2));
  } else {
    console.log("Scan succeeded. Items returned: "+data.Count);
    data.Items.forEach(function(email) {
      //console.log( JSON.stringify(email, null, 2)); //DEBUG
      putSanitizedItem(email,deleteDirtyItem);
      //**************
      //START HERE
      //**************
      //call putSanitizedItem with deleteDirtyItem as the callback
    });

    // If the total number of scanned items exceeds the maximum data set size
    // limit of 1 MB, the scan stops and results are returned to the user as a
    // LastEvaluatedKey value to continue the scan in a subsequent operation.
    // We'll pass that back to scanSesFailedTarget as ExclusiveStartKey.
    if (typeof data.LastEvaluatedKey != "undefined") {
      console.log("Scanning for more...");
      scanSesFailedTarget(data.LastEvaluatedKey, onScan);
    }
  }
} // onScan

scanSesFailedTarget(null, onScan);
