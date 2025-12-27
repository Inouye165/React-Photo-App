/** @type {import('dependency-cruiser').IConfiguration} */
module.exports = {
  forbidden: [
    /* rules from the 'recommended' preset: */
    {
      name: 'no-circular',
      severity: 'error',
      comment:
        'This dependency is part of a circular relationship. You might want to revise ' +
        'your solution (i.e. use dependency injection, unite modules) or make the ' +
        'module that creates the cycle a type-only dependency.',
      from: {},
      to: {
        circular: true
      }
    },
    {
      name: 'no-orphans',
      severity: 'warn',
      comment:
        "This is an orphan module - it's likely not used (anymore?). Either use it or " +
        "remove it. If it's logical this module is an orphan (i.e. it's a config file), " +
        "add it to your .dependency-cruiser.js's - options.doNotFollow - section.",
      from: {
        orphan: true,
        pathNot: [
          '(^|/)\\.[^/]+\\.(js|cjs|mjs|ts|json)$', // dot files
          '\\.d\\.ts$',                            // typescript declaration files
          '(^|/)tsconfig\\.json$',
          '(^|/)(babel|webpack|jest|vitest|rollup|vite)\\.config\\.(js|cjs|mjs|ts|json)$'
        ]
      },
      to: {}
    },
    {
      name: 'no-deprecated-core',
      comment:
        'A module depends on a node core module that has been deprecated. Find an alternative - these are ' +
        'bound to disappear in node.js 9.',
      severity: 'warn',
      from: {},
      to: {
        dependencyTypes: [
          'core'
        ],
        path: [
          '^(v8/tools/codemap)$',
          '^(v8/tools/consarray)$',
          '^(v8/tools/csvparser)$',
          '^(v8/tools/logreader)$',
          '^(v8/tools/profile_view)$',
          '^(v8/tools/profile)$',
          '^(v8/tools/SourceMap)$',
          '^(v8/tools/tickprocessor)$',
          '^(v8/tools/tickprocessor-driver)$',
          '^(node-inspect/lib/_inspect)$',
          '^(node-inspect/lib/internal/inspect_client)$',
          '^(node-inspect/lib/internal/inspect_repl)$',
          '^(async_hooks)$',
          '^(punycode)$',
          '^(domain)$',
          '^(constants)$',
          '^(sys)$',
          '^(url)$',
          '^(freelist)$',
          '^(smalloc)$',
          '^(colors)$',
          '^(module)$',
          '^(utils)$',
          '^(tiny-cli)$',
          '^(node-gyp)$',
          '^(node-pre-gyp)$',
          '^(node-sass)$',
          '^(npm)$',
          '^(npm-registry-client)$',
          '^(npm-registry-couchapp)$',
          '^(npm-registry-mock)$',
          '^(npm-user-validate)$',
          '^(npm-utils)$',
          '^(npm-visitor)$',
          '^(npmlog)$',
          '^(npmconf)$',
          '^(slide)$',
          '^(sorted-object)$',
          '^(spdx-correct)$',
          '^(spdx-expression-parse)$',
          '^(spdx-license-ids)$',
          '^(validate-npm-package-license)$',
          '^(validate-npm-package-name)$',
          '^(which)$',
          '^(wrappy)$',
          '^(write-file-atomic)$'
        ]
      }
    },
    {
      name: 'not-to-deprecated',
      comment:
        'This module uses a (version of an) npm module that has been deprecated. Use another version, or another module.',
      severity: 'warn',
      from: {},
      to: {
        dependencyTypes: [
          'deprecated'
        ]
      }
    },
    {
      name: 'no-non-package-json',
      severity: 'error',
      comment:
        "This module depends on an npm package that isn't in the 'dependencies' section of your package.json. " +
        "That's problematic as the package either (1) won't be available on live (2 - worse) will be " +
        "available on live with an non-guaranteed version. Fix it by adding the package to the dependencies " +
        "in your package.json.",
      from: {},
      to: {
        dependencyTypes: [
          'npm-no-pkg',
          'npm-unknown'
        ]
      }
    },
    {
      name: 'not-to-unresolvable',
      severity: 'error',
      comment:
        "This module depends on a module that cannot be found ('resolved to disk'). If it's an npm " +
        "module: add it to your package.json. In all other cases you likely already know what to do.",
      from: {},
      to: {
        couldNotResolve: true
      }
    },
    {
      name: 'no-duplicate-dep-types',
      comment:
        "Likely this module depends on an external ('npm') package that occurs more than once " +
        "in your package.json i.e. bot as a devDependency and as a regular dependency. This will " +
        "cause maintenance issues later on.",
      severity: 'warn',
      from: {},
      to: {
        moreThanOneDependencyType: true
      }
    },

    /* Custom Rules */
    {
      name: 'no-src-to-server',
      severity: 'error',
      comment: 'Frontend code (src/) should not import backend code (server/).',
      from: {
        path: '^src'
      },
      to: {
        path: '^server'
      }
    },
    {
      name: 'no-components-to-pages',
      severity: 'error',
      comment: 'Reusable components should not depend on pages.',
      from: {
        path: '^src/components'
      },
      to: {
        path: '^src/pages'
      }
    }
  ],
  options: {
    /* conditions to not follow */
    doNotFollow: {
      path: 'node_modules'
    },

    /* pattern specifying which files to include (regular expression) */
    includeOnly: '^src|^server',

    /* if true detects dependencies that only exist before typescript-to-javascript compilation */
    tsPreCompilationDeps: true,

    /* if true leaves symlinks untouched, otherwise resolves them */
    preserveSymlinks: false,

    /* TypeScript project file ('tsconfig.json') to use for (1) compilation and (2) resolution (if "tsPreCompilationDeps": true). */
    tsConfig: {
      fileName: 'tsconfig.json'
    }
  }
};
