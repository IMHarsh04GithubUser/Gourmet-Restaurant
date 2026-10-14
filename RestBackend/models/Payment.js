const mongoose = require("mongoose");

const Payment = new mongoose.Schema({
  cart: [
    {
      name: String,
      price: Number,
      quantity: Number,
    },
  ],
 
  totalAmount: {
    type: Number,
    required: true,
  },

  email:{
    type:String
  },

  address:{
    type:String
  }


 
});

const CartPayment = mongoose.model("CartBill", Payment);

module.exports = CartPayment;
