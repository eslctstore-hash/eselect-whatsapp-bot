import express from 'express';
import bodyParser from 'body-parser';
import axios from 'axios';
import 'dotenv/config';
import OpenAI from 'openai';

// --- Basic Setup ---
const app = express();
app.use(bodyParser.json());
const PORT = process.env.PORT || 3000;

// --- Environment Variables ---
const ULTRAMSG_INSTANCE_ID = process.env.ULTRAMSG_INSTANCE_ID;
const ULTRAMSG_TOKEN = process.env.ULTRAMSG_TOKEN;
const OPENAI_API_KEY = process.env.OPENAI_API_KEY;
const BOT_WHATSAPP_NUMBER = process.env.BOT_WHATSAPP_NUMBER;
const SUPPORT_PHONE_NUMBER = process.env.SUPPORT_PHONE_NUMBER;
const YOUR_STORE_API_URL = process.env.YOUR_STORE_API_URL;
const YOUR_STORE_API_TOKEN = process.env.YOUR_STORE_API_TOKEN;

// --- OpenAI Setup ---
const openai = new OpenAI({ apiKey: OPENAI_API_KEY });

// --- In-memory Storage ---
const userSessions = new Map();

// --- Shopify API Functions ---

async function findProduct(productName) {
  console.log(`Searching for Shopify product: ${productName}`);
  const shopifyUrl = `${YOUR_STORE_API_URL}/products.json?title=${encodeURIComponent(productName)}`;
  try {
    const response = await axios.get(shopifyUrl, {
      headers: {
        'X-Shopify-Access-Token': YOUR_STORE_API_TOKEN,
        'Content-Type': 'application/json'
      }
    });

    if (response.data && response.data.products.length > 0) {
      const product = response.data.products[0];
      const firstVariant = product.variants[0];
      const isAvailable = firstVariant.inventory_quantity > 0;
      return `Result: Product found. Name: ${product.title}, Price: ${firstVariant.price} OMR, Status: ${isAvailable ? `Available (${firstVariant.inventory_quantity} in stock)` : 'Out of Stock'}. Link: https://eselect.store/products/${product.handle}`;
    }
    return "Result: Product not found.";
  } catch (error) {
    console.error("Error finding Shopify product:", error.response ? error.response.data : error.message);
    return "Result: Error connecting to the store database.";
  }
}

async function getOrderDetails(orderName) {
    console.log(`Searching for Shopify order: ${orderName}`);
    const cleanOrderName = orderName.replace('#', '');
    const shopifyUrl = `${YOUR_STORE_API_URL}/orders.json?name=${encodeURIComponent(cleanOrderName)}&status=any`;
    try {
        const response = await axios.get(shopifyUrl, {
            headers: {
                'X-Shopify-Access-Token': YOUR_STORE_API_TOKEN,
                'Content-Type': 'application/json'
            }
        });

        if (response.data && response.data.orders.length > 0) {
            const order = response.data.orders[0];
            const trackingUrl = order.fulfillments.length > 0 ? (order.fulfillments[0].tracking_url || 'No tracking link yet') : 'Not shipped yet';
            const fulfillmentStatus = order.fulfillment_status || 'Unfulfilled';
            return `Result: Order #${order.name} status is: ${fulfillmentStatus}. Tracking link: ${trackingUrl}.`;
        }
        return `Result: No order found with this number.`;
    } catch (error) {
        console.error("Error finding Shopify order:", error.response ? error.response.data : error.message);
        return "Result: Error connecting to the store database.";
    }
}


// --- OpenAI Tool Definitions ---
const tools = [
  {
    type: "function",
    function: {
      name: "findProduct",
      description: "Searches for a specific product in the eSelect store and returns its details, price, and availability.",
      parameters: {
        type: "object",
        properties: { productName: { type: "string", description: "The name of the product to search for, e.g., 'iPhone 15' or 'Samsung Charger'" } },
        required: ["productName"],
      },
    },
  },
  {
    type: "function",
    function: {
        name: "getOrderDetails",
        description: "Looks up the status of a specific order using the customer's order number.",
        parameters: {
            type: "object",
            properties: { orderName: { type: "string", description: "The customer's order number, e.g., '#1050'" } },
            required: ["orderName"],
        },
    },
  },
];


// --- WhatsApp Helper Functions ---
async function sendWhatsappMessage(to, body) { /* Unchanged */ }
async function sendCallButton(to, body, phoneNumber) { /* Unchanged */ }

// --- Main Webhook Handler ---
app.post('/webhook', async (req, res) => {
    const messageData = req.body.data;
    if (!messageData) return res.sendStatus(200);

    const from = messageData.from;
    const messageBody = messageData.body;

    if (from === BOT_WHATSAPP_NUMBER) {
        console.log("Ignoring echo message from self.");
        return res.sendStatus(200);
    }

    try {
        if (!userSessions.has(from)) {
            userSessions.set(from, { history: [] });
        }
        const session = userSessions.get(from);
        
        // Add the current user message to the session history
        session.history.push({ role: "user", content: messageBody });

        const messages = [
            { role: "system", content: "You are a helpful customer service assistant for an Omani store named eSelect. Use the tools provided to search for products and orders. Speak in an Omani dialect. Store name: eSelect. Website: eselect.store" },
            ...session.history
        ];

        const initialResponse = await openai.chat.completions.create({
            model: "gpt-4o",
            messages: messages,
            tools: tools,
            tool_choice: "auto",
        });

        const responseMessage = initialResponse.choices[0].message;
        const toolCalls = responseMessage.tool_calls;

        if (toolCalls) {
            session.history.push(responseMessage);
            const availableFunctions = { findProduct, getOrderDetails };
            
            for (const toolCall of toolCalls) {
                const functionName = toolCall.function.name;
                const functionToCall = availableFunctions[functionName];
                const functionArgs = JSON.parse(toolCall.function.arguments);
                const functionResponse = await functionToCall(functionArgs[Object.keys(functionArgs)[0]]);
                
                session.history.push({
                    tool_call_id: toolCall.id,
                    role: "tool",
                    name: functionName,
                    content: functionResponse,
                });
            }

            // *** THE FIX IS HERE ***
            // We send the *entire updated history* back to OpenAI for the final response.
            const finalResponse = await openai.chat.completions.create({
                model: "gpt-4o",
                messages: session.history,
            });

            const finalMessage = finalResponse.choices[0].message.content;
            session.history.push({ role: 'assistant', content: finalMessage });
            await sendWhatsappMessage(from, finalMessage);

        } else {
            const aiResponse = responseMessage.content;
            session.history.push({ role: 'assistant', content: aiResponse });
            await sendWhatsappMessage(from, aiResponse);
        }
        
        if(session.history.length > 10) {
            session.history.splice(0, 4);
        }

    } catch (error) {
        console.error("Error in webhook processing:", error);
        await sendWhatsappMessage(from, "عذراً، حدث خطأ غير متوقع. يرجى المحاولة مرة أخرى.");
    }
    
    res.sendStatus(200);
});

// --- Server Start ---
app.listen(PORT, () => {
    console.log(`Server is running on port ${PORT}`);
});

// --- Unchanged Helper Functions ---
async function sendWhatsappMessage(to, body) {
    const url = `https://api.ultramsg.com/${ULTRAMSG_INSTANCE_ID}/messages/chat`;
    try {
        await axios.post(url, { token: ULTRAMSG_TOKEN, to, body, priority: 10 });
        console.log(`Message sent to ${to}`);
    } catch (error) {
        console.error("Error sending message:", error.response ? error.response.data : error.message);
    }
}

async function sendCallButton(to, body, phoneNumber) {
    const url = `https://api.ultramsg.com/${ULTRAMSG_INSTANCE_ID}/messages/buttons`;
    try {
        await axios.post(url, { token: ULTRAMSG_TOKEN, to, body, buttons: [{ "type": "call", "title": "اتصل بالدعم الفني", "payload": phoneNumber }] });
        console.log(`Call button sent to ${to}`);
    } catch (error) {
        console.error("Error sending call button:", error.response ? error.response.data : error.message);
    }
}
