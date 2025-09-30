/**
 * Advanced Framework Detection System
 * Uses multiple techniques to accurately detect web frameworks and technologies
 */

class FrameworkDetector {
  constructor() {
    this.detectionMethods = [
      'httpHeaders',
      'htmlContent',
      'urlPatterns',
      'dnsRecords',
      'sslCertificate',
      'responseTiming',
      'errorPages',
      'apiEndpoints',
      'robotsTxt',
      'sitemapXml'
    ];
    
    this.frameworkSignatures = {
      // React Detection
      react: {
        html: [
          'react',
          'react-dom',
          '__react',
          'reactjs',
          'react-app',
          'data-reactroot',
          'react-helmet',
          'react-router'
        ],
        headers: [
          'x-react-version',
          'x-react-app'
        ],
        js: [
          'react.js',
          'react.min.js',
          'react-dom.js',
          'react-dom.min.js'
        ],
        patterns: [
          /react.*\.js/gi,
          /__react.*\.js/gi,
          /react-dom.*\.js/gi
        ]
      },
      
      // Vue.js Detection
      vue: {
        html: [
          'vue',
          'vue.js',
          '__vue__',
          'vue-router',
          'vuex',
          'nuxt',
          'nuxt.js'
        ],
        headers: [
          'x-vue-version',
          'x-nuxt-version'
        ],
        js: [
          'vue.js',
          'vue.min.js',
          'vue-router.js',
          'nuxt.js'
        ],
        patterns: [
          /vue.*\.js/gi,
          /nuxt.*\.js/gi
        ]
      },
      
      // Angular Detection
      angular: {
        html: [
          'angular',
          'ng-',
          'angularjs',
          'angular.js',
          'ng-app',
          'ng-controller',
          'ng-view'
        ],
        headers: [
          'x-angular-version',
          'x-ng-version'
        ],
        js: [
          'angular.js',
          'angular.min.js',
          'angular-ui-router.js'
        ],
        patterns: [
          /angular.*\.js/gi,
          /ng-.*\.js/gi
        ]
      },
      
      // Flutter Detection
      flutter: {
        html: [
          'flutter',
          'main.dart.js',
          'flutter.js',
          'flutter_web',
          'dart',
          'flutter_web_ui'
        ],
        headers: [
          'x-flutter-version',
          'x-dart-version'
        ],
        js: [
          'main.dart.js',
          'flutter.js',
          'flutter_web_ui.js'
        ],
        patterns: [
          /main\.dart\.js/gi,
          /flutter.*\.js/gi,
          /dart.*\.js/gi
        ]
      },
      
      // WordPress Detection
      wordpress: {
        html: [
          'wp-content',
          'wp-includes',
          'wordpress',
          'wp-json',
          'wp-admin',
          'wp-embed',
          'wp-emoji',
          'wp-block-library'
        ],
        headers: [
          'x-powered-by',
          'x-wp-version'
        ],
        js: [
          'wp-embed.min.js',
          'wp-emoji-release.min.js',
          'wp-block-library.min.js'
        ],
        patterns: [
          /wp-.*\.js/gi,
          /wp-.*\.css/gi
        ],
        urls: [
          '/wp-admin/',
          '/wp-content/',
          '/wp-includes/',
          '/wp-json/',
          '/xmlrpc.php'
        ]
      },
      
      // Shopify Detection
      shopify: {
        html: [
          'shopify',
          'cdn.shopify.com',
          'shopifycdn.com',
          'myshopify.com',
          'shopify-section',
          'shopify-theme',
          'shopify-payment',
          'shopify-analytics'
        ],
        headers: [
          'x-shopify-stage',
          'x-shopify-shop-id',
          'x-shopify-request-id'
        ],
        js: [
          'shopify.js',
          'shopify-analytics.js',
          'shopify-payment.js'
        ],
        patterns: [
          /shopify.*\.js/gi,
          /cdn\.shopify\.com/gi
        ],
        urls: [
          '/admin/',
          '/account/',
          '/cart/',
          '/checkout/',
          '/products/',
          '/collections/'
        ]
      },
      
      // Next.js Detection
      nextjs: {
        html: [
          'next',
          'next.js',
          '_next',
          '__next',
          'nextjs'
        ],
        headers: [
          'x-nextjs-version',
          'x-nextjs-page'
        ],
        js: [
          '_next/static/',
          'next.js',
          'next.min.js'
        ],
        patterns: [
          /_next\/static/gi,
          /next.*\.js/gi
        ]
      },
      
      // Nuxt.js Detection
      nuxt: {
        html: [
          'nuxt',
          'nuxt.js',
          '_nuxt',
          '__nuxt'
        ],
        headers: [
          'x-nuxt-version',
          'x-nuxt-page'
        ],
        js: [
          '_nuxt/',
          'nuxt.js'
        ],
        patterns: [
          /_nuxt\//gi,
          /nuxt.*\.js/gi
        ]
      },
      
      // Laravel Detection
      laravel: {
        html: [
          'laravel',
          'laravel_session',
          'laravel_token',
          'laravel_csrf'
        ],
        headers: [
          'x-laravel-version',
          'x-laravel-session'
        ],
        js: [
          'laravel.js',
          'laravel-mix.js'
        ],
        patterns: [
          /laravel.*\.js/gi
        ],
        urls: [
          '/api/',
          '/storage/',
          '/vendor/'
        ]
      },
      
      // Django Detection
      django: {
        html: [
          'django',
          'csrfmiddlewaretoken',
          'django-admin',
          'django.contrib'
        ],
        headers: [
          'x-django-version',
          'x-csrftoken'
        ],
        js: [
          'django.js',
          'django-admin.js'
        ],
        patterns: [
          /django.*\.js/gi
        ],
        urls: [
          '/admin/',
          '/api/',
          '/static/',
          '/media/'
        ]
      },
      
      // Express.js Detection
      express: {
        html: [
          'express',
          'express.js'
        ],
        headers: [
          'x-powered-by',
          'x-express-version'
        ],
        js: [
          'express.js'
        ],
        patterns: [
          /express.*\.js/gi
        ]
      },
      
      // Supabase Detection
      supabase: {
        html: [
          'supabase',
          'supabase.co',
          'supabase.io',
          'supabase-js'
        ],
        headers: [
          'x-supabase-version'
        ],
        js: [
          'supabase.js',
          'supabase-js'
        ],
        patterns: [
          /supabase.*\.js/gi
        ],
        urls: [
          '/rest/v1/',
          '/auth/v1/',
          '/realtime/v1/',
          '/storage/v1/'
        ]
      }
    };
    
    this.hostingProviders = {
      netlify: {
        headers: ['x-nf-request-id', 'x-nf-cache-status'],
        patterns: [/netlify\.com/gi, /netlify\.app/gi],
        urls: ['/_netlify/']
      },
      vercel: {
        headers: ['x-vercel-id', 'x-vercel-cache'],
        patterns: [/vercel\.com/gi, /vercel\.app/gi],
        urls: ['/_vercel/']
      },
      firebase: {
        headers: ['x-firebase-version'],
        patterns: [/firebase\.com/gi, /firebaseapp\.com/gi],
        urls: ['/__/']
      },
      heroku: {
        headers: ['x-request-id'],
        patterns: [/herokuapp\.com/gi],
        urls: []
      },
      aws: {
        headers: ['x-amz-request-id', 'x-amz-cf-id'],
        patterns: [/amazonaws\.com/gi, /s3\.amazonaws\.com/gi],
        urls: []
      },
      cloudflare: {
        headers: ['cf-ray', 'cf-cache-status', 'cf-request-id'],
        patterns: [/cloudflare\.com/gi],
        urls: []
      },
      shopify: {
        headers: ['x-shopify-stage', 'x-shopify-shop-id'],
        patterns: [/shopify\.com/gi, /myshopify\.com/gi],
        urls: ['/admin/', '/account/']
      }
    };
  }

  /**
   * Main detection method that orchestrates all detection techniques
   */
  async detectFramework(url) {
    try {
      console.log(`🔍 Starting comprehensive framework detection for: ${url}`);
      
      const results = {
        url: url,
        timestamp: new Date().toISOString(),
        framework: 'Unknown',
        cms: 'Unknown',
        hosting: 'Unknown',
        technologies: [],
        confidence: 0,
        detectionMethods: {},
        details: {}
      };

      // Run all detection methods
      for (const method of this.detectionMethods) {
        try {
          results.detectionMethods[method] = await this[`detectBy${method.charAt(0).toUpperCase() + method.slice(1)}`](url);
        } catch (error) {
          console.warn(`Detection method ${method} failed:`, error.message);
          results.detectionMethods[method] = { error: error.message };
        }
      }

      // Analyze results and determine framework
      const analysis = this.analyzeResults(results.detectionMethods);
      results.framework = analysis.framework;
      results.cms = analysis.cms;
      results.hosting = analysis.hosting;
      results.technologies = analysis.technologies;
      results.confidence = analysis.confidence;
      results.details = analysis.details;

      console.log(`✅ Framework detection completed: ${results.framework} (${results.confidence}% confidence)`);
      return results;

    } catch (error) {
      console.error('Framework detection failed:', error);
      return {
        url: url,
        timestamp: new Date().toISOString(),
        framework: 'Unknown',
        cms: 'Unknown',
        hosting: 'Unknown',
        technologies: [],
        confidence: 0,
        error: error.message,
        detectionMethods: {}
      };
    }
  }

  /**
   * Detect framework by analyzing HTTP headers
   */
  async detectByHttpHeaders(url) {
    try {
      const response = await fetch(url, {
        method: 'HEAD',
        mode: 'cors',
        headers: {
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36'
        }
      });

      const headers = {};
      response.headers.forEach((value, key) => {
        headers[key.toLowerCase()] = value;
      });

      const detected = {
        headers: headers,
        frameworks: [],
        hosting: []
      };

      // Check for framework-specific headers
      for (const [framework, signatures] of Object.entries(this.frameworkSignatures)) {
        if (signatures.headers) {
          for (const header of signatures.headers) {
            if (headers[header.toLowerCase()]) {
              detected.frameworks.push({
                name: framework,
                confidence: 90,
                evidence: `Header: ${header} = ${headers[header.toLowerCase()]}`
              });
            }
          }
        }
      }

      // Check for hosting provider headers
      for (const [provider, signatures] of Object.entries(this.hostingProviders)) {
        if (signatures.headers) {
          for (const header of signatures.headers) {
            if (headers[header.toLowerCase()]) {
              detected.hosting.push({
                name: provider,
                confidence: 95,
                evidence: `Header: ${header} = ${headers[header.toLowerCase()]}`
              });
            }
          }
        }
      }

      return detected;
    } catch (error) {
      return { error: error.message };
    }
  }

  /**
   * Detect framework by analyzing HTML content
   */
  async detectByHtmlContent(url) {
    try {
      let htmlContent = '';
      
      // Try direct fetch first
      try {
        const response = await fetch(url, {
          method: 'GET',
          mode: 'cors',
          headers: {
            'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
          }
        });
        if (response.ok) {
          htmlContent = await response.text();
        }
      } catch (directError) {
        // Try with CORS proxy
        try {
          const proxyUrl = `https://api.allorigins.win/get?url=${encodeURIComponent(url)}`;
          const proxyResponse = await fetch(proxyUrl);
          const proxyData = await proxyResponse.json();
          
          if (proxyData.contents) {
            htmlContent = proxyData.contents;
          }
        } catch (proxyError) {
          return { error: 'Could not fetch HTML content due to CORS restrictions' };
        }
      }

      if (!htmlContent) {
        return { error: 'No HTML content available' };
      }

      const detected = {
        frameworks: [],
        technologies: [],
        meta: {}
      };

      const htmlLower = htmlContent.toLowerCase();

      // Extract meta information
      const titleMatch = htmlContent.match(/<title[^>]*>(.*?)<\/title>/i);
      if (titleMatch) {
        detected.meta.title = titleMatch[1];
      }

      const descriptionMatch = htmlContent.match(/<meta[^>]*name=["']description["'][^>]*content=["']([^"']*)["']/i);
      if (descriptionMatch) {
        detected.meta.description = descriptionMatch[1];
      }

      // Check for framework signatures
      for (const [framework, signatures] of Object.entries(this.frameworkSignatures)) {
        let confidence = 0;
        const evidence = [];

        // Check HTML content
        if (signatures.html) {
          for (const signature of signatures.html) {
            if (htmlLower.includes(signature.toLowerCase())) {
              confidence += 20;
              evidence.push(`HTML: ${signature}`);
            }
          }
        }

        // Check JavaScript files
        if (signatures.js) {
          for (const jsFile of signatures.js) {
            if (htmlLower.includes(jsFile.toLowerCase())) {
              confidence += 25;
              evidence.push(`JS: ${jsFile}`);
            }
          }
        }

        // Check patterns
        if (signatures.patterns) {
          for (const pattern of signatures.patterns) {
            if (pattern.test(htmlContent)) {
              confidence += 30;
              evidence.push(`Pattern: ${pattern}`);
            }
          }
        }

        if (confidence > 0) {
          detected.frameworks.push({
            name: framework,
            confidence: Math.min(confidence, 100),
            evidence: evidence
          });
        }
      }

      // Extract technology stack from HTML
      const techStack = this.extractTechnologyStack(htmlContent);
      detected.technologies = techStack;

      return detected;
    } catch (error) {
      return { error: error.message };
    }
  }

  /**
   * Detect framework by analyzing URL patterns
   */
  async detectByUrlPatterns(url) {
    try {
      const urlObj = new URL(url);
      const detected = {
        frameworks: [],
        hosting: [],
        patterns: []
      };

      const urlLower = url.toLowerCase();
      const domain = urlObj.hostname.toLowerCase();

      // Check for framework-specific URL patterns
      for (const [framework, signatures] of Object.entries(this.frameworkSignatures)) {
        if (signatures.urls) {
          for (const pattern of signatures.urls) {
            if (urlLower.includes(pattern.toLowerCase())) {
              detected.frameworks.push({
                name: framework,
                confidence: 85,
                evidence: `URL Pattern: ${pattern}`
              });
              detected.patterns.push(pattern);
            }
          }
        }
      }

      // Check for hosting provider patterns
      for (const [provider, signatures] of Object.entries(this.hostingProviders)) {
        if (signatures.patterns) {
          for (const pattern of signatures.patterns) {
            if (pattern.test(url) || pattern.test(domain)) {
              detected.hosting.push({
                name: provider,
                confidence: 90,
                evidence: `URL Pattern: ${pattern}`
              });
            }
          }
        }
      }

      return detected;
    } catch (error) {
      return { error: error.message };
    }
  }

  /**
   * Detect framework by analyzing DNS records
   */
  async detectByDnsRecords(url) {
    try {
      const urlObj = new URL(url);
      const domain = urlObj.hostname;
      
      // This would require a DNS lookup service
      // For now, we'll return basic domain analysis
      const detected = {
        domain: domain,
        subdomain: domain.split('.').length > 2,
        tld: domain.split('.').pop(),
        patterns: []
      };

      // Check for common hosting patterns in domain
      const hostingPatterns = {
        'netlify': /\.netlify\.app$/i,
        'vercel': /\.vercel\.app$/i,
        'firebase': /\.firebaseapp\.com$/i,
        'heroku': /\.herokuapp\.com$/i,
        'github': /\.github\.io$/i,
        'shopify': /\.myshopify\.com$/i
      };

      for (const [provider, pattern] of Object.entries(hostingPatterns)) {
        if (pattern.test(domain)) {
          detected.patterns.push({
            provider: provider,
            confidence: 95,
            evidence: `Domain pattern: ${domain}`
          });
        }
      }

      return detected;
    } catch (error) {
      return { error: error.message };
    }
  }

  /**
   * Detect framework by analyzing SSL certificate
   */
  async detectBySslCertificate(url) {
    try {
      // SSL certificate analysis would require server-side implementation
      // For now, we'll return basic HTTPS analysis
      const urlObj = new URL(url);
      const detected = {
        protocol: urlObj.protocol,
        secure: urlObj.protocol === 'https:',
        certificate: null
      };

      if (detected.secure) {
        detected.certificate = {
          valid: true,
          protocol: 'TLS',
          note: 'Certificate analysis requires server-side implementation'
        };
      }

      return detected;
    } catch (error) {
      return { error: error.message };
    }
  }

  /**
   * Detect framework by analyzing response timing
   */
  async detectByResponseTiming(url) {
    try {
      const startTime = performance.now();
      
      const response = await fetch(url, {
        method: 'HEAD',
        mode: 'cors',
        headers: {
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
        }
      });
      
      const endTime = performance.now();
      const responseTime = endTime - startTime;

      const detected = {
        responseTime: Math.round(responseTime),
        status: response.status,
        headers: {},
        performance: {
          fast: responseTime < 500,
          medium: responseTime >= 500 && responseTime < 2000,
          slow: responseTime >= 2000
        }
      };

      // Extract some headers for analysis
      response.headers.forEach((value, key) => {
        detected.headers[key.toLowerCase()] = value;
      });

      return detected;
    } catch (error) {
      return { error: error.message };
    }
  }

  /**
   * Detect framework by analyzing error pages
   */
  async detectByErrorPages(url) {
    try {
      const errorUrls = [
        `${url}/404`,
        `${url}/500`,
        `${url}/admin`,
        `${url}/wp-admin`,
        `${url}/api`,
        `${url}/test`
      ];

      const detected = {
        errorPages: [],
        frameworks: []
      };

      for (const errorUrl of errorUrls) {
        try {
          const response = await fetch(errorUrl, {
            method: 'HEAD',
            mode: 'cors',
            headers: {
              'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
            }
          });

          if (response.status >= 400) {
            detected.errorPages.push({
              url: errorUrl,
              status: response.status,
              headers: Object.fromEntries(response.headers.entries())
            });

            // Check for framework-specific error page patterns
            if (response.status === 404) {
              const contentType = response.headers.get('content-type');
              if (contentType && contentType.includes('text/html')) {
                // This could be a custom 404 page indicating a specific framework
                if (errorUrl.includes('/wp-admin')) {
                  detected.frameworks.push({
                    name: 'wordpress',
                    confidence: 70,
                    evidence: 'WordPress admin 404 page'
                  });
                }
              }
            }
          }
        } catch (error) {
          // Ignore individual URL errors
        }
      }

      return detected;
    } catch (error) {
      return { error: error.message };
    }
  }

  /**
   * Detect framework by analyzing API endpoints
   */
  async detectByApiEndpoints(url) {
    try {
      const apiUrls = [
        `${url}/api`,
        `${url}/api/v1`,
        `${url}/wp-json`,
        `${url}/rest/v1`,
        `${url}/auth/v1`,
        `${url}/graphql`,
        `${url}/api/graphql`
      ];

      const detected = {
        endpoints: [],
        frameworks: []
      };

      for (const apiUrl of apiUrls) {
        try {
          const response = await fetch(apiUrl, {
            method: 'GET',
            mode: 'cors',
            headers: {
              'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
            }
          });

          if (response.ok || response.status === 401 || response.status === 403) {
            detected.endpoints.push({
              url: apiUrl,
              status: response.status,
              contentType: response.headers.get('content-type'),
              headers: Object.fromEntries(response.headers.entries())
            });

            // Framework detection based on API endpoints
            if (apiUrl.includes('/wp-json')) {
              detected.frameworks.push({
                name: 'wordpress',
                confidence: 95,
                evidence: 'WordPress REST API endpoint'
              });
            } else if (apiUrl.includes('/rest/v1') || apiUrl.includes('/auth/v1')) {
              detected.frameworks.push({
                name: 'supabase',
                confidence: 90,
                evidence: 'Supabase API endpoint'
              });
            } else if (apiUrl.includes('/graphql')) {
              detected.frameworks.push({
                name: 'graphql',
                confidence: 80,
                evidence: 'GraphQL API endpoint'
              });
            }
          }
        } catch (error) {
          // Ignore individual API endpoint errors
        }
      }

      return detected;
    } catch (error) {
      return { error: error.message };
    }
  }

  /**
   * Detect framework by analyzing robots.txt
   */
  async detectByRobotsTxt(url) {
    try {
      const robotsUrl = `${url}/robots.txt`;
      const response = await fetch(robotsUrl, {
        method: 'GET',
        mode: 'cors',
        headers: {
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
        }
      });

      if (!response.ok) {
        return { error: 'robots.txt not found or not accessible' };
      }

      const robotsContent = await response.text();
      const detected = {
        content: robotsContent,
        frameworks: [],
        patterns: []
      };

      const contentLower = robotsContent.toLowerCase();

      // Check for framework-specific patterns in robots.txt
      if (contentLower.includes('wp-')) {
        detected.frameworks.push({
          name: 'wordpress',
          confidence: 80,
          evidence: 'WordPress paths in robots.txt'
        });
      }

      if (contentLower.includes('shopify')) {
        detected.frameworks.push({
          name: 'shopify',
          confidence: 85,
          evidence: 'Shopify references in robots.txt'
        });
      }

      if (contentLower.includes('_next')) {
        detected.frameworks.push({
          name: 'nextjs',
          confidence: 90,
          evidence: 'Next.js paths in robots.txt'
        });
      }

      return detected;
    } catch (error) {
      return { error: error.message };
    }
  }

  /**
   * Detect framework by analyzing sitemap.xml
   */
  async detectBySitemapXml(url) {
    try {
      const sitemapUrl = `${url}/sitemap.xml`;
      const response = await fetch(sitemapUrl, {
        method: 'GET',
        mode: 'cors',
        headers: {
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
        }
      });

      if (!response.ok) {
        return { error: 'sitemap.xml not found or not accessible' };
      }

      const sitemapContent = await response.text();
      const detected = {
        content: sitemapContent,
        frameworks: [],
        patterns: []
      };

      const contentLower = sitemapContent.toLowerCase();

      // Check for framework-specific patterns in sitemap
      if (contentLower.includes('/products/') || contentLower.includes('/collections/')) {
        detected.frameworks.push({
          name: 'shopify',
          confidence: 75,
          evidence: 'E-commerce patterns in sitemap'
        });
      }

      if (contentLower.includes('/wp-content/') || contentLower.includes('/category/')) {
        detected.frameworks.push({
          name: 'wordpress',
          confidence: 80,
          evidence: 'WordPress patterns in sitemap'
        });
      }

      return detected;
    } catch (error) {
      return { error: error.message };
    }
  }

  /**
   * Extract technology stack from HTML content
   */
  extractTechnologyStack(htmlContent) {
    const technologies = [];
    const htmlLower = htmlContent.toLowerCase();

    // Common technology patterns
    const techPatterns = {
      'jQuery': ['jquery', 'jquery.js', 'jquery.min.js'],
      'Bootstrap': ['bootstrap', 'bootstrap.css', 'bootstrap.js'],
      'Font Awesome': ['font-awesome', 'fontawesome'],
      'Google Analytics': ['google-analytics', 'gtag', 'ga.js'],
      'Google Tag Manager': ['googletagmanager', 'gtm.js'],
      'Facebook Pixel': ['facebook', 'fbq', 'pixel'],
      'Stripe': ['stripe', 'stripe.js'],
      'PayPal': ['paypal', 'paypal.js'],
      'Recaptcha': ['recaptcha', 'g-recaptcha'],
      'Cloudflare': ['cloudflare', 'cf-'],
      'Hotjar': ['hotjar', 'hj('],
      'Intercom': ['intercom', 'intercom.io'],
      'Mixpanel': ['mixpanel', 'mixpanel.js'],
      'Segment': ['segment', 'analytics.js']
    };

    for (const [tech, patterns] of Object.entries(techPatterns)) {
      for (const pattern of patterns) {
        if (htmlLower.includes(pattern.toLowerCase())) {
          technologies.push(tech);
          break;
        }
      }
    }

    return [...new Set(technologies)]; // Remove duplicates
  }

  /**
   * Analyze all detection results and determine the most likely framework
   */
  analyzeResults(detectionMethods) {
    const frameworkScores = {};
    const hostingScores = {};
    const technologies = new Set();
    const details = {};

    // Process each detection method
    for (const [method, result] of Object.entries(detectionMethods)) {
      if (result.error) {
        details[method] = { error: result.error };
        continue;
      }

      details[method] = result;

      // Process framework detections
      if (result.frameworks) {
        for (const framework of result.frameworks) {
          if (!frameworkScores[framework.name]) {
            frameworkScores[framework.name] = {
              confidence: 0,
              evidence: [],
              methods: []
            };
          }
          frameworkScores[framework.name].confidence += framework.confidence;
          frameworkScores[framework.name].evidence.push(...framework.evidence);
          frameworkScores[framework.name].methods.push(method);
        }
      }

      // Process hosting detections
      if (result.hosting) {
        for (const hosting of result.hosting) {
          if (!hostingScores[hosting.name]) {
            hostingScores[hosting.name] = {
              confidence: 0,
              evidence: [],
              methods: []
            };
          }
          hostingScores[hosting.name].confidence += hosting.confidence;
          hostingScores[hosting.name].evidence.push(...hosting.evidence);
          hostingScores[hosting.name].methods.push(method);
        }
      }

      // Process technologies
      if (result.technologies) {
        result.technologies.forEach(tech => technologies.add(tech));
      }
    }

    // Determine the most confident framework
    let bestFramework = 'Unknown';
    let bestConfidence = 0;

    for (const [framework, score] of Object.entries(frameworkScores)) {
      const avgConfidence = score.confidence / score.methods.length;
      if (avgConfidence > bestConfidence) {
        bestFramework = framework;
        bestConfidence = avgConfidence;
      }
    }

    // Determine the most confident hosting provider
    let bestHosting = 'Unknown';
    let bestHostingConfidence = 0;

    for (const [hosting, score] of Object.entries(hostingScores)) {
      const avgConfidence = score.confidence / score.methods.length;
      if (avgConfidence > bestHostingConfidence) {
        bestHosting = hosting;
        bestHostingConfidence = avgConfidence;
      }
    }

    // Determine CMS (usually same as framework for most cases)
    let cms = bestFramework;
    if (bestFramework === 'react' || bestFramework === 'vue' || bestFramework === 'angular') {
      cms = 'SPA (Single Page Application)';
    } else if (bestFramework === 'flutter') {
      cms = 'Flutter Web App';
    }

    return {
      framework: bestFramework,
      cms: cms,
      hosting: bestHosting,
      technologies: Array.from(technologies),
      confidence: Math.round(bestConfidence),
      details: details
    };
  }
}

// Export the class for use in other modules
export default FrameworkDetector;
