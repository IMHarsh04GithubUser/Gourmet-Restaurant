const express = require("express");
const cors = require("cors");
const bcrypt = require("bcryptjs");
const mongoose = require("mongoose");
const crypto = require("node:crypto");
const fs = require("node:fs");
const path = require("node:path");
const multer = require("multer");
const User = require("./models/employee");
const Menu = require("./models/AdminAdd");
const Order = require("./models/Order");
const Booking = require("./models/reservation");
const Message = require("./models/message");
const QuizAttempt = require("./models/QuizAttempt");
const {
  check,
  text,
  email,
  phone,
  password,
  objectId,
  HttpError,
} = require("./lib/validation");
const { auth, tokenFor, publicUser, limiter } = require("./lib/auth");
const { quote, normalizeItems } = require("./lib/pricing");
const { validSignature, applyPayment } = require("./lib/payments");
const { createMailer } = require("./lib/mail");
const questions = require("./data/quiz.json");
const wrap = (fn) => (req, res, next) =>
  Promise.resolve(fn(req, res, next)).catch(next);
const cleanOrder = (order) => {
  const obj = order.toObject ? order.toObject() : { ...order };
  delete obj.requestHash;
  delete obj.idempotencyKey;
  return obj;
};

function createApp({ env = process.env, gateway = null } = {}) {
  check(
    env.SECRET_KEY?.length >= 32 && !env.SECRET_KEY.startsWith("replace-"),
    "Set SECRET_KEY to a random value of at least 32 characters.",
    500,
  );
  const deliveryPaise = Number(env.DELIVERY_FEE_PAISE ?? 200);
  check(
    Number.isSafeInteger(deliveryPaise) && deliveryPaise >= 0,
    "DELIVERY_FEE_PAISE must be a non-negative integer.",
    500,
  );
  const online = Boolean(
    gateway && env.RAZORPAY_KEY_ID && env.RAZORPAY_KEY_SECRET,
  );
  const app = express();
  const origins = (
    env.CLIENT_ORIGINS || "http://localhost:5173,http://localhost:5174"
  )
    .split(",")
    .map((x) => x.trim());
  app.disable("x-powered-by");
  if (env.TRUST_PROXY_HOPS) {
    const trustProxyHops = Number(env.TRUST_PROXY_HOPS);
    check(
      Number.isSafeInteger(trustProxyHops) && trustProxyHops >= 1,
      "TRUST_PROXY_HOPS must be a positive integer.",
      500,
    );
    app.set("trust proxy", trustProxyHops);
  }
  app.use(
    cors({
      origin(origin, cb) {
        cb(
          origin && !origins.includes(origin)
            ? new HttpError(403, "This origin is not allowed.")
            : null,
          true,
        );
      },
    }),
  );
  app.use((req, res, next) => {
    res.set("X-Content-Type-Options", "nosniff");
    res.set("Referrer-Policy", "strict-origin-when-cross-origin");
    res.set("Cache-Control", "no-store");
    next();
  });
  const customer = auth(env.SECRET_KEY);
  const admin = auth(env.SECRET_KEY, true);
  const authLimit = limiter(40);
  const checkoutLimit = limiter(60);
  const formLimit = limiter(20);
  const mail = createMailer(env);

  // Raw bytes are essential: mount BEFORE express.json(). Mutations below are idempotent.
  app.post(
    "/api/payments/webhook",
    express.raw({ type: "application/json", limit: "256kb" }),
    wrap(async (req, res) => {
      check(env.RAZORPAY_WEBHOOK_SECRET, "Webhook is not configured.", 503);
      check(
        Buffer.isBuffer(req.body) &&
          validSignature(
            req.body,
            req.get("x-razorpay-signature"),
            env.RAZORPAY_WEBHOOK_SECRET,
          ),
        "Invalid webhook signature.",
        400,
      );
      let event;
      try {
        event = JSON.parse(req.body.toString("utf8"));
      } catch {
        throw new HttpError(400, "Invalid webhook payload.");
      }
      if (
        ![
          "payment.captured",
          "payment.failed",
          "order.paid",
          "refund.processed",
        ].includes(event.event)
      )
        return res.json({ received: true });
      let payment = event.payload?.payment?.entity;
      if (event.event === "refund.processed") {
        check(online, "Payment gateway unavailable.", 503);
        const id = event.payload?.refund?.entity?.payment_id;
        check(typeof id === "string", "Missing payment identifier.");
        payment = await gateway.payments.fetch(id);
      }
      check(
        payment && typeof payment.order_id === "string",
        "Missing payment details.",
      );
      let order = await Order.findOne({ gatewayOrderId: payment.order_id });
      // Recover the rare case where gateway creation succeeded but its local write failed.
      if (!order && online) {
        const gatewayOrder = await gateway.orders.fetch(payment.order_id);
        const localId = gatewayOrder.notes?.localOrderId;
        if (objectId(localId)) {
          order = await Order.findOne({
            _id: localId,
            paymentMethod: "razorpay",
            gatewayOrderId: { $exists: false },
          });
          if (
            order &&
            gatewayOrder.amount === order.totalPaise &&
            gatewayOrder.currency === order.currency
          ) {
            order.gatewayOrderId = payment.order_id;
            order.gatewayState = "ready";
            await order.save();
          } else order = null;
        }
      }
      // Other applications may share the merchant account.
      if (!order) return res.json({ received: true, ignored: true });
      await applyPayment(order, payment);
      res.json({ received: true });
    }),
  );
  app.use(express.json({ limit: "100kb" }));
  app.use(
    "/media",
    express.static(path.join(__dirname, "public"), {
      maxAge: "1d",
      dotfiles: "deny",
    }),
  );
  app.use(
    "/uploads",
    express.static(path.join(__dirname, "uploads"), {
      maxAge: "1d",
      dotfiles: "deny",
    }),
  );
  app.get("/api/health", (req, res) => {
    const ready = mongoose.connection.readyState === 1;
    res.status(ready ? 200 : 503).json({ ok: ready });
  });
  app.get("/api/config", (req, res) =>
    res.json({
      currency: "INR",
      deliveryPaise,
      onlinePaymentEnabled: online,
      paymentMode: online
        ? env.RAZORPAY_KEY_ID.startsWith("rzp_test_")
          ? "test"
          : "live"
        : "unavailable",
    }),
  );

  app.post(
    "/register",
    authLimit,
    wrap(async (req, res) => {
      const uname = text(req.body.uname, "Name", 2, 80);
      const address = text(req.body.address || "", "Address", 0, 500);
      const normalized = email(req.body.email);
      const hash = await bcrypt.hash(password(req.body.password), 12);
      const user = await User.create({
        uname,
        address,
        email: normalized,
        password: hash,
        role: "customer",
      });
      res
        .status(201)
        .json({
          token: tokenFor(user, env.SECRET_KEY),
          user: publicUser(user),
        });
    }),
  );
  app.post(
    "/login",
    authLimit,
    wrap(async (req, res) => {
      const normalized = email(req.body.email);
      check(
        typeof req.body.password === "string" &&
          Buffer.byteLength(req.body.password) <= 72,
        "Invalid email or password.",
        401,
      );
      const user = await User.findOne({ email: normalized }).select(
        "+password",
      );
      const valid =
        user?.password &&
        (await bcrypt.compare(req.body.password, user.password));
      check(valid, "Invalid email or password.", 401);
      res.json({
        token: tokenFor(user, env.SECRET_KEY),
        user: publicUser(user),
      });
    }),
  );
  app.get("/api/me", customer, (req, res) =>
    res.json({ user: publicUser(req.user) }),
  );
  app.get(
    "/list",
    wrap(async (req, res) => {
      const data = await Menu.find({ active: { $ne: false } })
        .sort({ category: 1, name: 1 })
        .limit(500)
        .lean();
      res.json({ success: true, data });
    }),
  );
  app.get(
    "/api/admin/menu",
    admin,
    wrap(async (req, res) =>
      res.json({
        data: await Menu.find().sort({ createdAt: -1 }).limit(500).lean(),
      }),
    ),
  );
  const uploadPath = path.join(__dirname, "uploads");
  fs.mkdirSync(uploadPath, { recursive: true });
  const upload = multer({
    storage: multer.memoryStorage(),
    limits: { fileSize: 5 * 1024 * 1024, files: 1 },
  });
  app.post(
    "/add",
    admin,
    upload.single("image"),
    wrap(async (req, res) => {
      const name = text(req.body.name, "Dish name", 2, 120);
      const description = text(req.body.description, "Description", 5, 500);
      const price = Number(req.body.price);
      check(
        Number.isFinite(price) &&
          price >= 1 &&
          price <= 10000 &&
          Math.abs(price * 100 - Math.round(price * 100)) < 0.001,
        "Price must be ₹1–₹10,000, with at most two decimals.",
      );
      check(
        ["Salad", "Starter", "Drinks", "Lunch", "Dessert"].includes(
          req.body.category,
        ),
        "Select a valid category.",
      );
      const b = req.file?.buffer;
      const ext = b?.subarray(0, 3).equals(Buffer.from([255, 216, 255]))
        ? "jpg"
        : b
              ?.subarray(0, 8)
              .equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]))
          ? "png"
          : b?.toString("ascii", 0, 4) === "RIFF" &&
              b?.toString("ascii", 8, 12) === "WEBP"
            ? "webp"
            : null;
      check(ext, "Upload a JPEG, PNG or WebP image under 5 MB.");
      const filename = `${crypto.randomUUID()}.${ext}`;
      await fs.promises.writeFile(path.join(uploadPath, filename), b);
      try {
        const item = await Menu.create({
          name,
          description,
          price,
          category: req.body.category,
          image: `/uploads/${filename}`,
        });
        res.status(201).json({ message: "Dish added to the menu.", item });
      } catch (err) {
        await fs.promises
          .unlink(path.join(uploadPath, filename))
          .catch(() => {});
        throw err;
      }
    }),
  );
  app.patch(
    "/api/admin/menu/:id",
    admin,
    wrap(async (req, res) => {
      check(
        objectId(req.params.id) && typeof req.body.active === "boolean",
        "Invalid menu update.",
      );
      const item = await Menu.findByIdAndUpdate(
        req.params.id,
        { active: req.body.active },
        { new: true, runValidators: true },
      );
      check(item, "Dish not found.", 404);
      res.json({ item });
    }),
  );
  app.post(
    "/remove",
    admin,
    wrap(async (req, res) => {
      check(objectId(req.body.id), "Invalid menu item.");
      const item = await Menu.findByIdAndUpdate(req.body.id, { active: false });
      check(item, "Dish not found.", 404);
      res.json({ success: true, message: "Dish hidden from the menu." });
    }),
  );

  app.post(
    "/api/checkout/quote",
    checkoutLimit,
    wrap(async (req, res) =>
      res.json(await quote(req.body.items, deliveryPaise)),
    ),
  );
  async function ownOrder(req) {
    check(objectId(req.params.id), "Order not found.", 404);
    const order = await Order.findOne({
      _id: req.params.id,
      userId: req.user._id,
    });
    check(order, "Order not found.", 404);
    return order;
  }
  function checkoutData(order) {
    return {
      order: cleanOrder(order),
      checkout:
        online && order.gatewayOrderId && order.status === "awaiting_payment"
          ? {
              key: env.RAZORPAY_KEY_ID,
              order_id: order.gatewayOrderId,
              amount: order.totalPaise,
              currency: order.currency,
            }
          : null,
    };
  }
  async function initializeGateway(order) {
    if (order.paymentMethod === "cod") return order;
    check(
      online,
      "Online payments are unavailable. Choose cash on delivery.",
      503,
    );
    if (order.gatewayOrderId) {
      if (order.status !== "awaiting_payment") return order;
      const payments = await gateway.orders.fetchPayments(order.gatewayOrderId);
      const captured = payments.items?.find((x) =>
        ["captured", "refunded"].includes(x.status),
      );
      if (captured) return applyPayment(order, captured);
      check(
        !payments.items?.some((x) => x.status === "authorized"),
        "Payment is authorised and awaiting capture. Check My orders shortly; do not pay again.",
        409,
      );
      return order;
    }
    const claimed = await Order.findOneAndUpdate(
      { _id: order._id, gatewayState: "new" },
      { gatewayState: "creating" },
      { new: true },
    );
    check(
      claimed,
      "Payment setup is pending. Check My orders before trying again.",
      409,
    );
    try {
      const gatewayOrder = await gateway.orders.create({
        amount: order.totalPaise,
        currency: "INR",
        receipt: order.id,
        notes: { localOrderId: order.id },
        partial_payment: false,
      });
      check(
        gatewayOrder.amount === order.totalPaise &&
          gatewayOrder.currency === "INR" &&
          gatewayOrder.id,
        "Payment provider returned an invalid order.",
        502,
      );
      return await Order.findByIdAndUpdate(
        order._id,
        { gatewayOrderId: gatewayOrder.id, gatewayState: "ready" },
        { new: true },
      );
    } catch (err) {
      await Order.updateOne(
        { _id: order._id, gatewayState: "creating" },
        { gatewayState: "review_required" },
      );
      throw new HttpError(
        502,
        "Payment setup could not be confirmed. Your order is saved in My orders; contact the restaurant before retrying.",
      );
    }
  }
  app.post(
    "/api/checkout/orders",
    customer,
    checkoutLimit,
    wrap(async (req, res) => {
      const items = normalizeItems(req.body.items);
      const paymentMethod = req.body.paymentMethod;
      check(
        ["cod", "razorpay"].includes(paymentMethod),
        "Select a payment method.",
      );
      check(
        paymentMethod !== "razorpay" || online,
        "Online payments are unavailable. Choose cash on delivery.",
        503,
      );
      const contact = {
        name: text(req.body.name, "Name", 2, 80),
        email: req.user.email,
        phone: phone(req.body.phone),
        address: text(req.body.address, "Delivery address", 10, 500),
      };
      const key = text(req.body.idempotencyKey, "Checkout reference", 16, 100);
      const requestHash = crypto
        .createHash("sha256")
        .update(JSON.stringify({ items, paymentMethod, contact }))
        .digest("hex");
      let order = await Order.findOne({
        userId: req.user._id,
        idempotencyKey: key,
      }).select("+requestHash");
      if (!order) {
        const totals = await quote(items, deliveryPaise);
        check(
          Number.isInteger(req.body.expectedTotalPaise) &&
            req.body.expectedTotalPaise === totals.totalPaise,
          "Menu prices changed. Review the updated total before placing your order.",
          409,
        );
        try {
          order = await Order.create({
            ...totals,
            customer: contact,
            userId: req.user._id,
            idempotencyKey: key,
            requestHash,
            paymentMethod,
            status: paymentMethod === "cod" ? "placed" : "awaiting_payment",
          });
        } catch (err) {
          if (err.code !== 11000) throw err;
          order = await Order.findOne({
            userId: req.user._id,
            idempotencyKey: key,
          }).select("+requestHash");
        }
      }
      check(
        order && order.requestHash === requestHash,
        "This checkout reference belongs to a different cart.",
        409,
      );
      order = await initializeGateway(order);
      res.status(201).json(checkoutData(order));
    }),
  );
  // Prevent old clients from submitting unverified prices through the previous endpoint.
  app.post("/cartbill", (req, res) =>
    res
      .status(410)
      .json({
        message: "Please refresh the website and use the secure checkout.",
      }),
  );
  app.get(
    "/api/orders",
    customer,
    wrap(async (req, res) => {
      const page = Math.max(
        1,
        Math.min(10000, Number.parseInt(req.query.page, 10) || 1),
      );
      const filter = { userId: req.user._id };
      const [orders, total] = await Promise.all([
        Order.find(filter)
          .sort({ createdAt: -1 })
          .skip((page - 1) * 20)
          .limit(20)
          .lean(),
        Order.countDocuments(filter),
      ]);
      res.json({
        data: orders.map(cleanOrder),
        page,
        pages: Math.ceil(total / 20),
      });
    }),
  );
  app.get(
    "/api/orders/:id",
    customer,
    wrap(async (req, res) =>
      res.json({ order: cleanOrder(await ownOrder(req)) }),
    ),
  );
  app.post(
    "/api/orders/:id/checkout",
    customer,
    checkoutLimit,
    wrap(async (req, res) => {
      res.json(checkoutData(await initializeGateway(await ownOrder(req))));
    }),
  );
  app.post(
    "/api/payments/verify",
    customer,
    checkoutLimit,
    wrap(async (req, res) => {
      check(online, "Payment gateway unavailable.", 503);
      const {
        orderId,
        razorpay_order_id,
        razorpay_payment_id,
        razorpay_signature,
      } = req.body;
      check(objectId(orderId), "Order not found.", 404);
      const order = await Order.findOne({ _id: orderId, userId: req.user._id });
      check(
        order && order.paymentMethod === "razorpay",
        "Order not found.",
        404,
      );
      check(
        razorpay_order_id === order.gatewayOrderId &&
          typeof razorpay_payment_id === "string",
        "Payment order mismatch.",
      );
      check(
        validSignature(
          `${order.gatewayOrderId}|${razorpay_payment_id}`,
          razorpay_signature,
          env.RAZORPAY_KEY_SECRET,
        ),
        "Payment verification failed. Check My orders before trying again.",
      );
      const payment = await gateway.payments.fetch(razorpay_payment_id);
      const updated = await applyPayment(order, payment);
      res
        .status(
          ["paid", "partially_refunded", "refunded"].includes(
            updated.paymentStatus,
          )
            ? 200
            : 202,
        )
        .json({ order: cleanOrder(updated) });
    }),
  );
  app.post(
    "/api/orders/:id/reconcile",
    customer,
    checkoutLimit,
    wrap(async (req, res) => {
      let order = await ownOrder(req);
      if (order.paymentMethod === "razorpay" && order.gatewayOrderId) {
        check(online, "Payment gateway unavailable.", 503);
        const payments = await gateway.orders.fetchPayments(
          order.gatewayOrderId,
        );
        const settled = payments.items?.find((x) =>
          ["captured", "refunded"].includes(x.status),
        );
        if (settled) order = await applyPayment(order, settled);
      }
      res.json({ order: cleanOrder(order) });
    }),
  );

  app.get(
    "/orders",
    admin,
    wrap(async (req, res) => {
      const page = Math.max(
        1,
        Math.min(10000, Number.parseInt(req.query.page, 10) || 1),
      );
      const [data, total] = await Promise.all([
        Order.find()
          .sort({ createdAt: -1 })
          .skip((page - 1) * 20)
          .limit(20)
          .lean(),
        Order.countDocuments(),
      ]);
      res.json({
        data: data.map(cleanOrder),
        page,
        pages: Math.ceil(total / 20),
        total,
      });
    }),
  );
  app.patch(
    "/api/admin/orders/:id",
    admin,
    wrap(async (req, res) => {
      check(objectId(req.params.id), "Order not found.", 404);
      const order = await Order.findById(req.params.id);
      check(order, "Order not found.", 404);
      const transitions = {
        placed: ["preparing", "cancelled"],
        preparing: ["out_for_delivery"],
        out_for_delivery: ["delivered"],
        delivered: [],
        awaiting_payment: [],
        cancelled: [],
      };
      const refundCancellation =
        req.body.status === "cancelled" &&
        order.paymentStatus === "refunded" &&
        !["delivered", "cancelled"].includes(order.status);
      check(
        transitions[order.status]?.includes(req.body.status) ||
          refundCancellation,
        "This status transition is not allowed.",
        409,
      );
      check(
        order.paymentMethod === "cod" ||
          order.paymentStatus === "paid" ||
          refundCancellation,
        "An online order must be paid before fulfilment.",
        409,
      );
      check(
        !(req.body.status === "cancelled" && order.paymentStatus === "paid"),
        "Refund paid orders through Razorpay first.",
        409,
      );
      const changes = { status: req.body.status };
      if (order.paymentMethod === "cod" && req.body.status === "delivered") {
        check(
          req.body.cashCollected === true,
          "Confirm cash collection before marking this order delivered.",
        );
        changes.paymentStatus = "paid";
        changes.paidAt = new Date();
      }
      const updated = await Order.findOneAndUpdate(
        {
          _id: order._id,
          status: order.status,
          paymentStatus: order.paymentStatus,
        },
        { $set: changes },
        { new: true },
      );
      check(updated, "This order changed. Refresh and try again.", 409);
      res.json({ order: cleanOrder(updated) });
    }),
  );

  app.post(
    "/booking",
    formLimit,
    wrap(async (req, res) => {
      const data = {
        name: text(req.body.name, "Name", 2, 80),
        email: email(req.body.email),
        phone: phone(req.body.phone),
        persons: Number(req.body.persons),
        time: text(req.body.time, "Time", 5, 5),
      };
      check(
        Number.isInteger(data.persons) &&
          data.persons >= 1 &&
          data.persons <= 12,
        "Select 1–12 guests.",
      );
      check(
        /^\d{4}-\d{2}-\d{2}$/.test(req.body.date) &&
          /^\d{2}:\d{2}$/.test(data.time),
        "Select a valid date and time.",
      );
      const date = new Date(`${req.body.date}T${data.time}:00+05:30`);
      check(
        Number.isFinite(date.getTime()) &&
          date > new Date() &&
          date.getTime() < Date.now() + 366 * 86400000,
        "Choose a future date within the next year.",
      );
      check(
        data.time >= "09:30" && data.time <= "22:00",
        "Reservations are available between 9:30 AM and 10:00 PM.",
      );
      const booking = await Booking.create({
        ...data,
        date,
        status: "requested",
      });
      void mail(
        data.email,
        "Reservation request received",
        `Hello ${data.name}, your request for ${data.persons} guests on ${req.body.date} at ${data.time} is received. The restaurant will confirm availability. Reference: ${booking.id}.`,
      );
      res
        .status(201)
        .json({
          message:
            "Reservation requested. The restaurant will confirm availability.",
          id: booking.id,
        });
    }),
  );
  app.post(
    "/message",
    formLimit,
    wrap(async (req, res) => {
      const data = {
        name: text(req.body.name, "Name", 2, 80),
        email: email(req.body.email),
        phone: req.body.phone ? phone(req.body.phone) : undefined,
        message: text(req.body.message, "Message", 10, 2000),
      };
      await Message.create(data);
      res
        .status(201)
        .json({
          message:
            "Your message has been received. Thank you for getting in touch.",
        });
    }),
  );
  app.get(
    "/api/admin/requests",
    admin,
    wrap(async (req, res) => {
      const [bookings, messages] = await Promise.all([
        Booking.find().sort({ _id: -1 }).limit(100).lean(),
        Message.find().sort({ _id: -1 }).limit(100).lean(),
      ]);
      res.json({ bookings, messages });
    }),
  );
  app.patch(
    "/api/admin/bookings/:id",
    admin,
    wrap(async (req, res) => {
      check(
        objectId(req.params.id) &&
          ["confirmed", "cancelled"].includes(req.body.status),
        "Invalid reservation update.",
      );
      const booking = await Booking.findOneAndUpdate(
        { _id: req.params.id, status: "requested" },
        { status: req.body.status },
        { new: true },
      );
      check(booking, "Reservation already handled or not found.", 409);
      void mail(
        booking.email,
        `Reservation ${booking.status}`,
        `Hello ${booking.name}, your reservation for ${booking.persons} guests has been ${booking.status}. Reference: ${booking.id}.`,
      );
      res.json({ booking });
    }),
  );

  app.get(
    "/api/quiz-questions",
    customer,
    formLimit,
    wrap(async (req, res) => {
      const selected = [...questions]
        .sort(() => crypto.randomInt(3) - 1)
        .slice(0, 10);
      const attempt = await QuizAttempt.create({
        userId: req.user._id,
        username: req.user.uname,
        questionIds: selected.map((x) => x.id),
        expiresAt: new Date(Date.now() + 15 * 60000),
      });
      res.json({
        attemptId: attempt.id,
        questions: selected.map(({ answer, ...q }) => q),
      });
    }),
  );
  app.post(
    "/api/submit-quiz",
    customer,
    formLimit,
    wrap(async (req, res) => {
      check(
        objectId(req.body.attemptId) && Array.isArray(req.body.answers),
        "Invalid quiz attempt.",
      );
      const attempt = await QuizAttempt.findOne({
        _id: req.body.attemptId,
        userId: req.user._id,
      });
      check(
        attempt && attempt.expiresAt > new Date(),
        "This quiz expired. Start a new one.",
        409,
      );
      if (attempt.completed)
        return res.json({
          score: attempt.score,
          total: attempt.questionIds.length,
        });
      check(
        req.body.answers.length === attempt.questionIds.length &&
          req.body.answers.every(
            (x) => Number.isInteger(x) && x >= 0 && x <= 3,
          ),
        "Answer every question.",
      );
      const score = attempt.questionIds.reduce(
        (sum, id, i) =>
          sum +
          Number(
            questions.find((x) => x.id === id).answer === req.body.answers[i],
          ),
        0,
      );
      const saved = await QuizAttempt.findOneAndUpdate(
        { _id: attempt._id, completed: false },
        { completed: true, score },
        { new: true },
      );
      res.json({
        score: saved ? score : (await QuizAttempt.findById(attempt._id)).score,
        total: attempt.questionIds.length,
      });
    }),
  );
  app.get(
    "/api/leaderboard",
    wrap(async (req, res) => {
      const data = await QuizAttempt.aggregate([
        { $match: { completed: true } },
        { $sort: { score: -1, createdAt: 1 } },
        {
          $group: {
            _id: "$userId",
            username: { $first: "$username" },
            score: { $first: "$score" },
          },
        },
        { $sort: { score: -1, username: 1 } },
        { $limit: 10 },
        { $project: { _id: 0, username: 1, score: 1 } },
      ]);
      res.json(data);
    }),
  );
  app.use((req, res) =>
    res.status(404).json({ message: "Endpoint not found." }),
  );
  app.use((error, req, res, next) => {
    if (res.headersSent) return next(error);
    const status =
      error.code === 11000
        ? 409
        : error instanceof multer.MulterError
          ? 400
          : error.status ||
            (error.name === "ValidationError" ||
            error.name === "CastError" ||
            error.type === "entity.parse.failed"
              ? 400
              : 500);
    if (status >= 500)
      console.error("Request failed:", error.name, "status", status);
    res
      .status(status)
      .json({
        message:
          error.code === 11000
            ? "This email or reference already exists."
            : error instanceof multer.MulterError
              ? "Upload one image under 5 MB."
              : status < 500 || error instanceof HttpError
                ? error.message
                : "The service is temporarily unavailable. Please try again.",
      });
  });
  return app;
}
module.exports = { createApp };
