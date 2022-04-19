const stripe = require('stripe')(process.env.STRIPE_SECRET_KEY);


export default async function handler(req, res) {
  if(req.method === "POST") {
    try {
      
      const product = await stripe.products.create({
        name: 'Gold Special',
      });
    } catch (error) {
      console.log(error);
      res.status(500).send("Server error");
    }
  }
}