const mongoose = require('mongoose')

const YourQuery = mongoose.Schema({
    name:String,
    email:String,
    phone:Number,
    message:String
})

const QueryMessage = mongoose.model('User Message',YourQuery)

module.exports = QueryMessage