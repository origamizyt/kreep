# Kreep - Automated Password Storage

Kreep is an automated tool for cloud credential storage. Once set up on server, you can use scripting systems (e.g. Tampermonkey) to automatically fetch your credentials from your server and perform auto-login. 

## Setup

Clone this repository and build via `cargo`:
``` 
$ git clone https://github.com/origamizyt/kreep.git
$ cd kreep
$ cargo build -r
```

Add a credential to the database:
```
$ ./kreep create -u username
Password:
Inserted credential <id>.
```

Copy the UUID (&lt;id&gt;), which is an unique id for your credential.

Generate a Tampermonkey script:
```
$ ./kreep export <id> -f tampermonkey -u <website> > script.js
```

Where &lt;website&gt; is the website whose login you want to automate.

The script should have the following format:
```js
// ==UserScript==
// @name         Kreep Auto Fill
// @description  Kreep Auto Fill
// @version      1.0
// @author       You
// @match        <website>
// @grant        none
// ==/UserScript==

(function() {
    'use strict';

    fetch('http://localhost:4500/static/kreep.js')
        .then(resp => resp.text())
        .then(text => {
            const script = document.createElement('script');
            script.innerText = text.trim();
            document.head.appendChild(script);
            new window.Kreep(
                '<id>',
                '<api_key>',
                'http://localhost:4500'
            )
            .userInput(document.querySelector(''))
            .passwordInput(document.querySelector(''))
            .autoFill();
        });
})();
```

Fill in the `querySelector` calls to match the website's setting (user and password will be auto-filled in these inputs). If Kreep was set up on a server other than 127.0.0.1, change the `localhost` binding to the server ip / domain name.

If the form on the website has a submit button, you can add the following line to use it:
```js
// ...
.passwordInput(document.querySelector('...'))
.submitButton(document.querySelector('...'))
.autoFill();
// ...
```

Done! Now launch your server:
```
$ ./kreep run
```

Now you should be able to use your script.