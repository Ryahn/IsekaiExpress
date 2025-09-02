const path = require("path");
const nunjucks = require("nunjucks");
const express = require("express");
const config = require("../../config/.config");

/**
 * Static and Template middleware - handles Nunjucks, static files, and view engine setup
 */
class StaticMiddleware {
  constructor(app, viewsPath, publicPath) {
    this.app = app;
    this.viewsPath = viewsPath || path.join(__dirname, "../views");
    this.publicPath = publicPath || path.join(__dirname, "../public");
  }

  /**
   * Set views directory path
   */
  setViewsPath(viewsPath) {
    this.viewsPath = viewsPath;
  }

  /**
   * Set public directory path
   */
  setPublicPath(publicPath) {
    this.publicPath = publicPath;
  }

  /**
   * Configure Nunjucks template engine
   */
  configureNunjucks() {
    nunjucks.configure(this.viewsPath, {
      autoescape: true,
      express: this.app,
      watch: config.template.watch,
      noCache: config.template.noCache,
      throwOnUndefined: config.template.undefined,
      trimBlocks: config.template.trimBlocks,
      lstripBlocks: config.template.lstripBlocks,
    });

    return this;
  }

  /**
   * Setup static file serving
   */
  setupStaticFiles() {
    this.app.use("/public", express.static(this.publicPath));
    return this;
  }

  /**
   * Setup view engine configuration
   */
  setupViewEngine() {
    this.app.set("views", this.viewsPath);
    this.app.set("view engine", "njk");
    return this;
  }

  /**
   * Setup body parsing middleware
   */
  setupBodyParsing() {
    const bodyParser = require("body-parser");
    this.app.use(bodyParser.json());
    this.app.use(bodyParser.urlencoded({ extended: true }));
    return this;
  }

  /**
   * Setup production trust proxy if needed
   */
  setupTrustProxy() {
    if (process.env.NODE_ENV === "production") {
      this.app.set("trust proxy", 1);
    }
    return this;
  }

  /**
   * Get all static and template middleware in correct order
   */
  getAllMiddleware() {
    return [
      this.setupTrustProxy(),
      this.configureNunjucks(),
      this.setupStaticFiles(),
      this.setupBodyParsing(),
      this.setupViewEngine()
    ];
  }

  /**
   * Apply all middleware to the app
   */
  apply() {
    this.setupTrustProxy();
    this.configureNunjucks();
    this.setupStaticFiles();
    this.setupBodyParsing();
    this.setupViewEngine();
    
    return this;
  }
}

module.exports = StaticMiddleware;
