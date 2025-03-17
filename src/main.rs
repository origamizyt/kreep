pub mod credential;
pub mod storage;

use std::{io::{stdin, stdout, Write}, path::{Path, PathBuf}};

use actix_cors::Cors;
use actix_web::{web::{self, Data}, App, HttpResponse, HttpServer, Responder};
use anyhow::Result;
use clap::Parser;
use credential::{Credential, CredentialIndexer};
use handlebars::Handlebars;
use rpassword::prompt_password;
use serde::Serialize;
use storage::Storage;
use uuid::Uuid;

const KREEP_JS: &'static str = include_str!("../js/kreep.js");

const TAMPERMONKEY_HBS: &'static str = include_str!("../js/tampermonkey.hbs");

#[actix_web::post("/{id}")]
async fn fetch_credential(st: Data<Storage<Credential, CredentialIndexer>>, id: web::Path<String>) -> impl Responder {
    let Ok(id) = Uuid::parse_str(&id) else {
        return HttpResponse::BadRequest()
            .body("cannot parse uuid");
    };
    let Ok(Some(credential)) = st.get(&id) else {
        return HttpResponse::NotFound()
            .body("cannot find credential");
    };
    let Ok(capsule) = credential.capsule() else {
        return HttpResponse::InternalServerError()
            .body("cannot encapsulate credential")
    };
    HttpResponse::Ok().body(capsule.to_hex())
}

#[actix_web::get("/static/kreep.js")]
async fn get_kreep_script() -> impl Responder {
    HttpResponse::Ok()
        .content_type("text/javascript")
        .body(KREEP_JS)
}

async fn run_server(db_path: &Path, host: &str, port: u16) -> Result<()> {
    let st = Storage::open(db_path, CredentialIndexer)?;
    let data = Data::new(st);
    HttpServer::new(move || {
        let cors = Cors::default()
        .allow_any_origin()
        .allow_any_header()
        .allow_any_method();
        App::new()
            .wrap(cors)
            .app_data(data.clone())
            .service(fetch_credential)
            .service(get_kreep_script)
    })
    .bind((host, port))?
    .run()
    .await?;
    Ok(())
}

fn list_credentials(db_path: &Path, show_password: bool, show_api_key: bool) -> Result<()> {
    let st = Storage::open(db_path, CredentialIndexer)?;
    for cred in st.iter() {
        let cred = cred?;
        println!("Id = {}", cred.id.hyphenated());
        println!("User = {}", cred.user);
        if show_password {
            println!("Password = {}", cred.password);
        }
        else {
            print!("Password = ");
            for _ in 0..cred.password.len() {
                print!("*");
            }
            println!();
        }
        if show_api_key {
            println!("API Key = {}", hex::encode(cred.api_key));
        }
        println!();
    }
    println!("{} credentials in total.", st.len());
    Ok(())
}

fn peek_credential(db_path: &Path, id: &Uuid, show_password: bool, show_api_key: bool) -> Result<()> {
    let st = Storage::open(db_path, CredentialIndexer)?;
    match st.get(id)? {
        Some(cred) => {
            println!("Id = {}", cred.id.hyphenated());
            println!("User = {}", cred.user);
            if show_password {
                println!("Password = {}", cred.password);
            }
            else {
                print!("Password = ");
                for _ in 0..cred.password.len() {
                    print!("*");
                }
                println!();
            }
            if show_api_key {
                println!("API Key = {}", hex::encode(cred.api_key));
            }
        },
        None => {
            eprintln!("Credential {} not found.", id.hyphenated());
        }
    };
    Ok(())
}

fn export_tampermonkey(db_path: &Path, id: &Uuid, mut context: ScriptContext) -> Result<()> {
    let st = Storage::open(db_path, CredentialIndexer)?;
    match st.get(id)? {
        Some(cred) => {
            context.id = Some(cred.id.hyphenated().to_string());
            context.api_key = Some(hex::encode(cred.api_key));
            let reg = Handlebars::new();
            let tpl = reg.render_template(TAMPERMONKEY_HBS, &context)?;
            println!("{}", tpl);
        },
        None => {
            eprintln!("Credential {} not found.", id.hyphenated());
        }
    }
    Ok(())
}

fn create_credential(db_path: &Path, mut user: Option<String>, mut password: Option<String>) -> Result<()> {
    if user.is_none() {
        print!("User: ");
        stdout().flush()?;
        user = Some(String::new());
        stdin().read_line(user.as_mut().unwrap())?;
    }
    if password.is_none() {
        password = Some(prompt_password("Password: ")?);
    }
    let st = Storage::open(db_path, CredentialIndexer)?;
    let cred = Credential::new(&user.unwrap(), &password.unwrap());
    let id = cred.id.clone();
    st.set(cred)?;
    println!("Inserted credential {}.", id.hyphenated());
    Ok(())
}

fn remove_credential(db_path: &Path, id: &Uuid) -> Result<()> {
    let st = Storage::open(db_path, CredentialIndexer)?;
    if st.remove(id)? {
        println!("Deleted credential {}.", id.hyphenated());
    }
    else {
        eprintln!("Credential {} not found.", id.hyphenated());
    }
    Ok(())
}

#[derive(Parser)]
struct Args {
    #[clap(long, value_name = "FILE", default_value = "./storage")]
    #[clap(help = "Sets a custom database path.")]
    pub db: PathBuf,
    
    #[clap(subcommand)]
    pub command: Subcommand
}

#[derive(clap::Subcommand)]
enum Subcommand {
    Run {
        #[clap(short = 'H', long, default_value = "0.0.0.0")]
        #[clap(help = "Custom HTTP host to serve on.")]
        host: String,

        #[clap(short, long, default_value_t = 4500)]
        #[clap(help = "Custom HTTP port to serve on.")]
        port: u16
    },
    List {
        #[clap(short = 'p', long, default_value_t = false)]
        #[clap(help = "Whether to display password in clear text.")]
        show_password: bool,
        #[clap(short = 'k', long, default_value_t = false)]
        #[clap(help = "Whether to display api key in clear text.")]
        show_api_key: bool
    },
    Peek {
        #[clap(help = "Id of the credential to peek.")]
        id: Uuid,
        #[clap(short = 'p', long, default_value_t = false)]
        #[clap(help = "Whether to display password in clear text.")]
        show_password: bool,
        #[clap(short = 'k', long, default_value_t = false)]
        #[clap(help = "Whether to display api key in clear text.")]
        show_api_key: bool
    },
    Export {
        #[clap(help = "Id of the credential to export.")]
        id: Uuid,
        #[clap(short, long, default_value_t = ExportFormat::Tampermonkey, value_enum)]
        #[clap(help = "In which format will the credential be exported.")]
        format: ExportFormat,

        #[clap(short = 'n', long, default_value = "Kreep Auto Fill")]
        #[clap(help = "Custom script name.")]
        script_name: String,
        #[clap(short = 'd', long, default_value = "Kreep Auto Fill")]
        #[clap(help = "Custom script description.")]
        script_description: String,
        #[clap(short = 'v', long, default_value = "1.0")]
        #[clap(help = "Custom script version.")]
        script_version: String,
        #[clap(short = 'u', long, required = true)]
        #[clap(help = "Custom script page url.")]
        script_page_url: String,

        #[clap(short = 'H', long, default_value = "localhost")]
        #[clap(help = "Kreep HTTP host to connect to.")]
        http_host: String,
        #[clap(short = 'p', long, default_value_t = 4500)]
        #[clap(help = "Kreep HTTP port to connect to.")]
        http_port: u16,

        #[clap(long, default_value = "")]
        #[clap(help = "User input CSS selector.")]
        user_input_selector: String,
        #[clap(long, default_value = "")]
        #[clap(help = "Password input CSS selector.")]
        password_input_selector: String,
        #[clap(long)]
        #[clap(help = "Submit button CSS selector.")]
        submit_button_selector: Option<String>
    },
    Create {
        #[clap(short, long)]
        #[clap(help = "Sets the user of the credential.")]
        user: Option<String>,
        #[clap(short, long)]
        #[clap(help = "Sets the password of the credential.")]
        password: Option<String>
    },
    Remove {
        #[clap(help = "Id of the credential to remove.")]
        id: Uuid
    }
}

#[derive(clap::ValueEnum, Clone)]
enum ExportFormat {
    Tampermonkey
}

#[derive(Serialize)]
struct ScriptContext {
    // script metadata
    pub script_name: String,
    pub script_description: String,
    pub script_version: String,
    pub script_page_url: String,
    
    // http
    pub http_host: String,
    pub http_port: u16,

    // kreep parameters
    pub id: Option<String>,
    pub api_key: Option<String>,
    pub user_input_selector: String,
    pub password_input_selector: String,
    pub submit_button_selector: Option<String>
}

#[actix_web::main]
async fn main() -> Result<()> {
    let args = Args::parse();
    
    match args.command {
        Subcommand::Run { host, port } => {
            run_server(&args.db, &host, port).await
        },
        Subcommand::List { show_password, show_api_key } => {
            list_credentials(&args.db, show_password, show_api_key)
        },
        Subcommand::Peek { id, show_password, show_api_key } => {
            peek_credential(&args.db, &id, show_password, show_api_key)
        },
        Subcommand::Export { 
            id, format, 
            script_name, script_description, script_version, script_page_url, 
            http_host, http_port, 
            user_input_selector, password_input_selector, submit_button_selector } => {
            let context = ScriptContext {
                script_name,
                script_description,
                script_version,
                script_page_url,
                http_host,
                http_port,
                id: None,
                api_key: None,
                user_input_selector,
                password_input_selector,
                submit_button_selector
            };
            match format {
                ExportFormat::Tampermonkey => {
                    export_tampermonkey(&args.db, &id, context)
                }
            }
        },
        Subcommand::Create { user, password } => {
            create_credential(&args.db, user, password)
        },
        Subcommand::Remove { id } => {
            remove_credential(&args.db, &id)
        }
    }
}