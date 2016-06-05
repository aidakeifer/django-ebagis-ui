/// <reference path="../../../typings/main.d.ts" />

var app = angular.module('ebagis', [
    'app.templates',
    'ui.bootstrap',
    'ngCookies',
    'ngResource',
    'ngSanitize',
    'ui.router',
]);

app.directive('header', function(){
  return {
    restrict: 'E',
    templateUrl: 'app-templates/app/partial/header/header.html',
  };
});

app.directive('headerAccount', function(){
  return {
    restrict: 'E',
    templateUrl: 'app-templates/app/partial/header/account.html',
  };
});

app.config(["$stateProvider", function ($stateProvider, $urlRouterProvider) {

    //$urlRouterProvider.otherwise('/');

    $stateProvider

    // anonymous states
    .state("login", {
        url: '/account/login',
        templateUrl: 'partial/account/login.html',
        controller: 'LoginController',
        resolve: {
            auth: ["Auth", function (Auth) { return Auth.isAnonymous(); }],
            userProfile: "UserProfile",
        }
    })

    .state("register", {
        url: '/account/register',
        templateUrl: 'app-templates/app/partial/account/register.html',
        controller: 'RegisterController',
        resolve: {
            auth: ["Auth", function (Auth) { return Auth.isAnonymous(); }],
            userProfile: "UserProfile",
        }
    })

    // authenticated states
    .state("logout", {
        url: 'account/logout',
        templateUrl: 'app-templates/app/partial/account/logout.html',
        controller: 'LogoutController',
        resolve: {
            auth: ["Auth", function (Auth) { return Auth.isAuthenticated(); }],
            userProfile: "UserProfile",
        }
    })

    .state("account", {
        url: 'account/',
        templateUrl: 'app-templates/app/partial/account/account.html',
        resolve: {
            auth: ["Auth", function (Auth) { return Auth.isAuthenticated(); }],
            userProfile: "UserProfile",
        }
    })

    .state("home", {
        url: '/',
        templateUrl: 'app-templates/app/partial/main/home.html',
        resolve: {
            auth: ["Auth", function (Auth) { return Auth.isAuthenticated(); }],
            userProfile: "UserProfile",
        }
    })

    // staff-only states

    // admin-only states
    .state("admin", {
        /* ... */
        resolve: {
        auth: ["Auth", function (Auth) { return Auth.hasRole("ROLE_ADMIN"); }],
        }
    });

}])

app.factory("Auth", ["$q", "UserProfile", function ($q, UserProfile) {

  var Auth = {

    var userProfile = UserProfile

    OK: 200,

    // "we don't know who you are, so we can't say if you're authorized to access
    // this resource or not yet, please sign in first"
    UNAUTHORIZED: 401,

    // "we know who you are, and your profile does not allow you to access this resource"
    FORBIDDEN: 403,

    hasRole: function (role) {
        if (userProfile.$hasRole(role)) {
          return Auth.OK;
        } else if (userProfile.$isAnonymous()) {
          return $q.reject(Auth.UNAUTHORIZED);
        } else {
          return $q.reject(Auth.FORBIDDEN);
        }
      });
    },

    hasAnyRole: function (roles) {
      return UserProfile.then(function (userProfile) {
        if (userProfile.$hasAnyRole(roles)) {
          return Auth.OK;
        } else if (userProfile.$isAnonymous()) {
          return $q.reject(Auth.UNAUTHORIZED);
        } else {
          return $q.reject(Auth.FORBIDDEN);
        }
      });
    },

    isAnonymous: function () {
      return UserProfile.then(function (userProfile) {
        if (userProfile.$isAnonymous()) {
          return Auth.OK;
        } else {
          return $q.reject(Auth.FORBIDDEN);
        }
      });
    },

    isAuthenticated: function () {
      return UserProfile.then(function (userProfile) {
        if (userProfile.$isAuthenticated()) {
          return Auth.OK;
        } else {
          return $q.reject(Auth.UNAUTHORIZED);
        }
      });
    }

  };

  return Auth;

}])

app.factory("UserProfile", ["djangoAuth", function (djangoAuth) {

    var userProfile = {};

    var fetchUserProfile = function () {
        return djangoAuth.profile().then(
            function (response) {
                for (var prop in userProfile) {
                    if (userProfile.hasOwnProperty(prop)) {
                        delete userProfile[prop];
                    }
                }

            return angular.extend(userProfile, response.data, {

                $refresh: fetchUserProfile,

                $hasRole: function (role) {
                    return userProfile.roles.indexOf(role) >= 0;
                },

                $hasAnyRole: function (roles) {
                    return !!userProfile.roles.filter(function (role) {
                        return roles.indexOf(role) >= 0;
                    }).length;
                },

                $isAnonymous: function () {
                    return !userProfile.hasOwnProperty('username');
                },

                $isAuthenticated: function () {
                    return userProfile.hasOwnProperty('username');
                }
            });
        });
    };

    return fetchUserProfile();

}])

app.run(["$rootScope", "Auth", "$state", function ($rootScope, Auth, $state) {

  $rootScope.$on("$stateChangeError", function (event, toState, toParams, fromState, fromParams, error) {
    if (error == Auth.UNAUTHORIZED) {
      $state.go("login");
    } else if (error == Auth.FORBIDDEN) {
      $state.go("forbidden");
    }
  });

}])

app.controller('UserprofileCtrl', function ($scope, djangoAuth, Validate) {
    $scope.model = {'first_name':'','last_name':'','email':''};
    $scope.complete = false;
    djangoAuth.profile().then(function(data){
        $scope.model = data;
    });
    $scope.updateProfile = function(formData, model){
      $scope.errors = [];
      Validate.form_validation(formData,$scope.errors);
      if(!formData.$invalid){
        djangoAuth.updateProfile(model)
        .then(function(data){
            // success case
            $scope.complete = true;
        },function(data){
            // error case
            $scope.error = data;
        });
      }
    }
  });

app.controller('AuthrequiredCtrl', function ($scope) {
    $scope.awesomeThings = [
      'HTML5 Boilerplate',
      'AngularJS',
      'Karma'
    ];
  });

app.service('djangoAuth', function djangoAuth($q, $http, $cookies, $rootScope) {
    // AngularJS will instantiate a singleton by calling "new" on this function
    var service = {
        /* START CUSTOMIZATION HERE */
        // Change this to point to your Django REST Auth API
        // e.g. /api/rest-auth  (DO NOT INCLUDE ENDING SLASH)
        'API_URL': 'https://test.ebagis.geog.pdx.edu/api/rest/account',
        // Set use_session to true to use Django sessions to store security token.
        // Set use_session to false to store the security token locally and transmit it as a custom header.
        'use_session': false,
        /* END OF CUSTOMIZATION */
        'authenticated': null,
        'authPromise': null,
        'request': function(args) {
            // Let's retrieve the token from the cookie, if available
            if($cookies.get('token')){
                $http.defaults.headers.common.Authorization = 'Token ' + $cookies.get('token');
            }
            // Continue
            params = args.params || {}
            args = args || {};
            var deferred = $q.defer(),
                url = this.API_URL + args.url,
                method = args.method || "GET",
                params = params,
                data = args.data || {};
            // Fire the request, as configured.
            $http({
                url: url,
                withCredentials: this.use_session,
                method: method.toUpperCase(),
                headers: {'X-CSRFToken': $cookies['csrftoken']},
                params: params,
                data: data
            })
            .success(angular.bind(this,function(data, status, headers, config) {
                deferred.resolve(data, status);
            }))
            .error(angular.bind(this,function(data, status, headers, config) {
                console.log("error syncing with: " + url);
                // Set request status
                if(data){
                    data.status = status;
                }
                if(status == 0){
                    if(data == ""){
                        data = {};
                        data['status'] = 0;
                        data['non_field_errors'] = ["Could not connect. Please try again."];
                    }
                    // or if the data is null, then there was a timeout.
                    if(data == null){
                        // Inject a non field error alerting the user
                        // that there's been a timeout error.
                        data = {};
                        data['status'] = 0;
                        data['non_field_errors'] = ["Server timed out. Please try again."];
                    }
                }
                // check to see if the error was a 401 and user is not yet logged in
                if (data.status == 401) {
                    // in this case we want to resolve the promise per success
                    deferred.resolve(data, status);
                } else {
                    deferred.reject(data, status, headers, config);
                }
            }));
            return deferred.promise;
        },
        'register': function(username,password1,password2,email,more){
            var data = {
                'username':username,
                'password1':password1,
                'password2':password2,
                'email':email
            }
            data = angular.extend(data,more);
            return this.request({
                'method': "POST",
                'url': "/registration/",
                'data' :data
            });
        },
        'login': function(username,password){
            var djangoAuth = this;
            return this.request({
                'method': "POST",
                'url': "/login/",
                'data':{
                    'username':username,
                    'password':password
                }
            }).then(function(data){
                if(!djangoAuth.use_session){
                    $http.defaults.headers.common.Authorization = 'Token ' + data.key;
                    $cookies.put("token", data.key);
                }
                djangoAuth.authenticated = true;
                $rootScope.$broadcast("djangoAuth.logged_in", data);
            });
        },
        'logout': function(){
            var djangoAuth = this;
            return this.request({
                'method': "POST",
                'url': "/logout/"
            }).then(function(data){
            delete $http.defaults.headers.common.Authorization;
                $cookies.remove('token');
                djangoAuth.authenticated = false;
                $rootScope.$broadcast("djangoAuth.logged_out");
            });
        },
        'changePassword': function(password1,password2){
            return this.request({
                'method': "POST",
                'url': "/password/change/",
                'data':{
                    'new_password1':password1,
                    'new_password2':password2
                }
            });
        },
        'resetPassword': function(email){
            return this.request({
                'method': "POST",
                'url': "/password/reset/",
                'data':{
                    'email':email
                }
            });
        },
        'profile': function(){
            return this.request({
                'method': "GET",
                'url': "/user/"
            }); 
        },
        'updateProfile': function(data){
            return this.request({
                'method': "PATCH",
                'url': "/user/",
                'data':data
            }); 
        },
        'verify': function(key){
            return this.request({
                'method': "POST",
                'url': "/registration/verify-email/",
                'data': {'key': key} 
            });            
        },
        'confirmReset': function(uid,token,password1,password2){
            return this.request({
                'method': "POST",
                'url': "/password/reset/confirm/",
                'data':{
                    'uid': uid,
                    'token': token,
                    'new_password1':password1,
                    'new_password2':password2
                }
            });
        },
        'authenticationStatus': function(restrict, force){
            // Set restrict to true to reject the promise if not logged in
            // Set to false or omit to resolve when status is known
            // Set force to true to ignore stored value and query API
            restrict = restrict || false;
            force = force || false;
            if(this.authPromise == null || force){
                this.authPromise = this.request({
                    'method': "GET",
                    'url': "/user/"
                })
            }
            var da = this;
            var getAuthStatus = $q.defer();
            if(this.authenticated != null && !force){
                // We have a stored value which means we can pass it back right away.
                if(this.authenticated == false && restrict){
                    getAuthStatus.reject("User is not logged in.");
                }else{
                    getAuthStatus.resolve();
                }
            }else{
                // There isn't a stored value, or we're forcing a request back to
                // the API to get the authentication status.
                this.authPromise.then(function(){
                    da.authenticated = true;
                    getAuthStatus.resolve();
                },function(){
                    da.authenticated = false;
                    if(restrict){
                        getAuthStatus.reject("User is not logged in.");
                    }else{
                        getAuthStatus.resolve();
                    }
                });
            }
            return getAuthStatus.promise;
        },
        'initialize': function(url, sessions){
            this.API_URL = url;
            this.use_session = sessions;
            return this.authenticationStatus(true, true);
        }

    }
    return service;
  });

app.controller('LoginController', function ($scope, $state, djangoAuth, Validate, userProfile) {
    $scope.model = {
        'username':'',
        'password':''
    };
    $scope.complete = false;

    $scope.login = function(formData) {
        $scope.errors = [];
        Validate.form_validation(formData,$scope.errors);
        
        if (!formData.$invalid) {
            djangoAuth.login($scope.model.username, $scope.model.password)
            .then(
                // we've logged in successfully
                function(){
                    // so let's get this new user's profile
                    return userProfile.$refresh();
                }
                .then(
                    // we've refreshed the user profile
                    function() {
                        // redirect to the home page
                        $state.go('home');
                    },
                    function(data) {
                        // error case
                        $scope.errors = data;
                    }
            ));
        }
    }
});

app.controller('LogoutController', function ($scope, $state, djangoAuth) {
    djangoAuth.logout();
    $state.go('login');
});

app.controller('MainController', function ($scope, $cookies, $location, djangoAuth) {
    
    $scope.login = function(){
      djangoAuth.login(prompt('Username'),prompt('password'))
      .then(function(data){
        handleSuccess(data);
      },handleError);
    }
    
    $scope.logout = function(){
      djangoAuth.logout()
      .then(handleSuccess,handleError);
    }
    
    $scope.resetPassword = function(){
      djangoAuth.resetPassword(prompt('Email'))
      .then(handleSuccess,handleError);
    }
    
    $scope.register = function(){
      djangoAuth.register(prompt('Username'),prompt('Password'),prompt('Email'))
      .then(handleSuccess,handleError);
    }
    
    $scope.verify = function(){
      djangoAuth.verify(prompt("Please enter verification code"))
      .then(handleSuccess,handleError);
    }
    
    $scope.goVerify = function(){
      $location.path("/verifyEmail/"+prompt("Please enter verification code"));
    }
    
    $scope.changePassword = function(){
      djangoAuth.changePassword(prompt("Password"), prompt("Repeat Password"))
      .then(handleSuccess,handleError);
    }
    
    $scope.profile = function(){
      djangoAuth.profile()
      .then(handleSuccess,handleError);
    }
    
    $scope.updateProfile = function(){
      djangoAuth.updateProfile({'first_name': prompt("First Name"), 'last_name': prompt("Last Name"), 'email': prompt("Email")})
      .then(handleSuccess,handleError);
    }
    
    $scope.confirmReset = function(){
      djangoAuth.confirmReset(prompt("Code 1"), prompt("Code 2"), prompt("Password"), prompt("Repeat Password"))
      .then(handleSuccess,handleError);
    }

    $scope.goConfirmReset = function(){
      $location.path("/passwordResetConfirm/"+prompt("Code 1")+"/"+prompt("Code 2"))
    }
    
    var handleSuccess = function(data){
      $scope.response = data;
    }
    
    var handleError = function(data){
      $scope.response = data;
    }

    $scope.show_login = true;
    $scope.$on("djangoAuth.logged_in", function(data){
      $scope.show_login = false;
    });
    $scope.$on("djangoAuth.logged_out", function(data){
      $scope.show_login = true;
    });

  });

app.controller('MasterController', function ($scope, $location, djangoAuth) {
    // Assume user is not logged in until we hear otherwise
    $scope.authenticated = false;
    // Wait for the status of authentication, set scope var to true if it resolves
    djangoAuth.authenticationStatus(true).then(function(){
        $scope.authenticated = true;
    });
    // Wait and respond to the logout event.
    $scope.$on('djangoAuth.logged_out', function() {
      $scope.authenticated = false;
    });
    // Wait and respond to the log in event.
    $scope.$on('djangoAuth.logged_in', function() {
      $scope.authenticated = true;
    });
    // If the user attempts to access a restricted page, redirect them back to the main page.
    $scope.$on('$routeChangeError', function(ev, current, previous, rejection){
      console.error("Unable to change routes.  Error: ", rejection)
      $location.path('/restricted').replace('/login');
    });
  });

app.controller('PasswordchangeController', function ($scope, djangoAuth, Validate) {
    $scope.model = {'new_password1':'','new_password2':''};
    $scope.complete = false;
    $scope.changePassword = function(formData){
      $scope.errors = [];
      Validate.form_validation(formData,$scope.errors);
      if(!formData.$invalid){
        djangoAuth.changePassword($scope.model.new_password1, $scope.model.new_password2)
        .then(function(data){
            // success case
            $scope.complete = true;
        },function(data){
            // error case
            $scope.errors = data;
        });
      }
    }
  });

app.controller('PasswordresetController', function ($scope, djangoAuth, Validate) {
    $scope.model = {'email':''};
    $scope.complete = false;
    $scope.resetPassword = function(formData){
      $scope.errors = [];
      Validate.form_validation(formData,$scope.errors);
      if(!formData.$invalid){
        djangoAuth.resetPassword($scope.model.email)
        .then(function(data){
            // success case
            $scope.complete = true;
        },function(data){
            // error case
            $scope.errors = data;
        });
      }
    }
  });

app.controller('PasswordresetconfirmController', function ($scope, $routeParams, djangoAuth, Validate) {
    $scope.model = {'new_password1':'','new_password2':''};
    $scope.complete = false;
    $scope.confirmReset = function(formData){
      $scope.errors = [];
      Validate.form_validation(formData,$scope.errors);
      if(!formData.$invalid){
        djangoAuth.confirmReset($routeParams['firstToken'], $routeParams['passwordResetToken'], $scope.model.new_password1, $scope.model.new_password2)
        .then(function(data){
            // success case
            $scope.complete = true;
        },function(data){
            // error case
            $scope.errors = data;
        });
      }
    }
  });

app.controller('RestrictedController', function ($scope, $location) {
    $scope.$on('djangoAuth.logged_in', function() {
      $location.path('/');
    });
  });

app.controller('RegisterController', function ($scope, djangoAuth, Validate) {
    $scope.model = {'username':'','password':'','email':''};
    $scope.complete = false;
    $scope.register = function(formData){
      $scope.errors = [];
      Validate.form_validation(formData,$scope.errors);
      if(!formData.$invalid){
        djangoAuth.register($scope.model.username,$scope.model.password1,$scope.model.password2,$scope.model.email)
        .then(function(data){
            // success case
            $scope.complete = true;
        },function(data){
            // error case
            $scope.errors = data;
        });
      }
    }
  });

app.service('Validate', function Validate() {
    return {
        'message': {
            'minlength': 'This value is not long enough.',
            'maxlength': 'This value is too long.',
            'email': 'A properly formatted email address is required.',
            'required': 'This field is required.'
        },
        'more_messages': {
            'demo': {
                'required': 'Here is a sample alternative required message.'
            }
        },
        'check_more_messages': function(name,error){
            return (this.more_messages[name] || [])[error] || null;
        },
        validation_messages: function(field,form,error_bin){
            var messages = [];
            for(var e in form[field].$error){
                if(form[field].$error[e]){
                    var special_message = this.check_more_messages(field,e);
                    if(special_message){
                        messages.push(special_message);
                    }else if(this.message[e]){
                        messages.push(this.message[e]);
                    }else{
                        messages.push("Error: " + e)
                    }
                }
            }
            var deduped_messages = [];
            angular.forEach(messages, function(el, i){
                if(deduped_messages.indexOf(el) === -1) deduped_messages.push(el);
            });
            if(error_bin){
                error_bin[field] = deduped_messages;
            }
        },
        'form_validation': function(form,error_bin){
            for(var field in form){
                if(field.substr(0,1) != "$"){
                    this.validation_messages(field,form,error_bin);
                }
            }
        }
    }
});

app.controller('VerifyemailController', function ($scope, $routeParams, djangoAuth) {
    djangoAuth.verify($routeParams["emailVerificationToken"]).then(function(data){
        $scope.success = true;
    },function(data){
        $scope.failure = false;
    });
  });
