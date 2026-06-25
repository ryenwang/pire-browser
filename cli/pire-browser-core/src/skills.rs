use serde::Serialize;
use std::env;
use std::fs;
use std::path::{Path, PathBuf};

pub const CORE_SKILL_NAME: &str = "core";
pub const CORE_SKILL_DESCRIPTION: &str = "Core pire-browser workflow for safe Firefox automation.";
pub const DOGFOOD_SKILL_NAME: &str = "dogfood";
pub const DOGFOOD_SKILL_DESCRIPTION: &str =
    "Systematic exploratory QA for web apps using pire-browser evidence.";
pub const AGENT_BROWSER_SKILLS_DIR_ENV: &str = "AGENT_BROWSER_SKILLS_DIR";
pub const PIRE_BROWSER_SKILLS_DIR_ENV: &str = "PIRE_BROWSER_SKILLS_DIR";

const CORE_SKILL_RAW: &str = include_str!("../../../skill-data/core/SKILL.md");
const DOGFOOD_SKILL_RAW: &str = include_str!("../../../skill-data/dogfood/SKILL.md");

struct EmbeddedSkill {
    name: &'static str,
    description: &'static str,
    raw: &'static str,
}

const EMBEDDED_SKILLS: &[EmbeddedSkill] = &[
    EmbeddedSkill {
        name: CORE_SKILL_NAME,
        description: CORE_SKILL_DESCRIPTION,
        raw: CORE_SKILL_RAW,
    },
    EmbeddedSkill {
        name: DOGFOOD_SKILL_NAME,
        description: DOGFOOD_SKILL_DESCRIPTION,
        raw: DOGFOOD_SKILL_RAW,
    },
];

#[derive(Debug, Clone, PartialEq, Eq, Serialize)]
pub struct SkillSummary {
    pub name: String,
    pub description: String,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize)]
pub struct SkillContent {
    pub name: String,
    pub description: String,
    pub content: String,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize)]
pub struct SkillPath {
    pub name: String,
    pub description: String,
    pub path: String,
    pub source: String,
}

pub fn list_skills() -> Vec<SkillSummary> {
    if let Some(dir) = skills_dir_override_from_env() {
        return list_skills_from_dir(&dir);
    }
    embedded_skills()
}

fn embedded_skills() -> Vec<SkillSummary> {
    EMBEDDED_SKILLS
        .iter()
        .map(|skill| SkillSummary {
            name: skill.name.to_string(),
            description: skill.description.to_string(),
        })
        .collect()
}

pub fn skill_content(name: &str) -> Option<SkillContent> {
    if let Some(dir) = skills_dir_override_from_env() {
        return skill_content_from_dir(&dir, name);
    }
    embedded_skill_content(name)
}

pub fn skill_path(name: &str) -> Option<SkillPath> {
    if let Some(dir) = skills_dir_override_from_env() {
        return skill_path_from_dir(&dir, name);
    }
    let content = embedded_skill_content(name)?;
    Some(SkillPath {
        name: content.name,
        description: content.description,
        path: format!("embedded:{name}"),
        source: "embedded".to_string(),
    })
}

fn skill_path_from_dir(root: &Path, name: &str) -> Option<SkillPath> {
    let content = skill_content_from_dir(root, name)?;
    Some(SkillPath {
        name: content.name,
        description: content.description,
        path: root.join(name).to_string_lossy().to_string(),
        source: "filesystem".to_string(),
    })
}

fn embedded_skill_content(name: &str) -> Option<SkillContent> {
    let skill = EMBEDDED_SKILLS.iter().find(|skill| skill.name == name)?;
    Some(SkillContent {
        name: skill.name.to_string(),
        description: skill.description.to_string(),
        content: normalize_skill_text(skill.raw),
    })
}

fn skills_dir_override_from_env() -> Option<PathBuf> {
    env_path(PIRE_BROWSER_SKILLS_DIR_ENV).or_else(|| env_path(AGENT_BROWSER_SKILLS_DIR_ENV))
}

fn env_path(key: &str) -> Option<PathBuf> {
    let value = env::var_os(key)?;
    if value.is_empty() {
        return None;
    }
    Some(PathBuf::from(value))
}

fn list_skills_from_dir(root: &Path) -> Vec<SkillSummary> {
    let mut skills = Vec::new();
    let Ok(entries) = fs::read_dir(root) else {
        return skills;
    };
    for entry in entries.flatten() {
        let path = entry.path().join("SKILL.md");
        let Some(content) = read_skill_file(&path) else {
            continue;
        };
        skills.push(SkillSummary {
            name: content.name,
            description: content.description,
        });
    }
    skills.sort_by(|left, right| left.name.cmp(&right.name));
    skills
}

fn skill_content_from_dir(root: &Path, name: &str) -> Option<SkillContent> {
    if !valid_skill_name(name) {
        return None;
    }
    let content = read_skill_file(&root.join(name).join("SKILL.md"))?;
    (content.name == name).then_some(content)
}

fn read_skill_file(path: &Path) -> Option<SkillContent> {
    let raw = fs::read_to_string(path).ok()?;
    let content = normalize_skill_text(&raw);
    let (name, description) = skill_frontmatter(&content)?;
    Some(SkillContent {
        name,
        description,
        content,
    })
}

fn valid_skill_name(name: &str) -> bool {
    !name.is_empty()
        && name
            .chars()
            .all(|ch| ch.is_ascii_alphanumeric() || matches!(ch, '-' | '_' | '.'))
}

fn skill_frontmatter(content: &str) -> Option<(String, String)> {
    let mut lines = content.lines();
    if lines.next()? != "---" {
        return None;
    }
    let mut name = None;
    let mut description = None;
    for line in lines {
        if line == "---" {
            break;
        }
        let (key, value) = line.split_once(':')?;
        let value = value.trim().trim_matches('"').to_string();
        match key.trim() {
            "name" => name = Some(value),
            "description" => description = Some(value),
            _ => {}
        }
    }
    Some((name?, description.unwrap_or_default()))
}

pub fn normalize_skill_text(text: &str) -> String {
    text.replace("\r\n", "\n").replace('\r', "\n")
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn lists_core_skill() {
        let skills = list_skills();
        assert_eq!(skills.len(), 2);
        assert_eq!(skills[0].name, "core");
        assert!(skills[0].description.contains("Firefox automation"));
        assert_eq!(skills[1].name, "dogfood");
        assert!(skills[1].description.contains("exploratory QA"));
    }

    #[test]
    fn core_skill_content_is_embedded_and_normalized() {
        let skill = skill_content("core").unwrap();
        assert!(skill.content.starts_with("---\nname: core\n"));
        assert!(skill
            .content
            .contains("pire-browser open https://example.com"));
        assert!(skill.content.contains("pire-browser snapshot -i"));
        assert!(skill.content.contains("pire-browser snapshot -i -c"));
        assert!(skill.content.contains("pire-browser snapshot -d 3"));
        assert!(skill.content.contains("pire-browser snapshot -i -C"));
        assert!(skill
            .content
            .contains("pire-browser snapshot -i -c -C -d 5"));
        assert!(skill.content.contains("pire-browser wait '@"));
        assert!(skill
            .content
            .contains("pire-browser wait --load networkidle"));
        assert!(skill
            .content
            .contains("pire-browser find text \"Save\" --exact"));
        assert!(skill.content.contains("pire-browser mouse move"));
        assert!(skill.content.contains("pire-browser drag"));
        assert!(skill.content.contains("pire-browser pdf"));
        assert!(skill
            .content
            .contains("pire-browser screenshot --hide-scrollbars false"));
        assert!(skill.content.contains("pire-browser set viewport"));
        assert!(skill.content.contains("pire-browser device"));
        assert!(skill.content.contains("pire-browser set device"));
        assert!(skill.content.contains("pire-browser set geo"));
        assert!(skill.content.contains("pire-browser set headers"));
        assert!(skill.content.contains("pire-browser set credentials"));
        assert!(skill.content.contains("pire-browser set offline"));
        assert!(skill.content.contains("pire-browser vitals"));
        assert!(skill.content.contains("pire-browser trace start"));
        assert!(skill.content.contains("pire-browser profiler start"));
        assert!(skill.content.contains("pire-browser record start"));
        assert!(skill.content.contains("screenshot-sequence QA"));
        assert!(skill.content.contains("QA evidence bundle"));
        assert!(skill
            .content
            .contains("pire-browser open https://api.example.com --headers"));
        assert!(skill
            .content
            .contains("pire-browser network wait-for-response"));
        assert!(skill.content.contains("pire-browser batch --bail"));
        assert!(skill.content.contains("pire-browser auth login"));
        assert!(skill.content.contains("pire-browser tab new"));
        assert!(skill.content.contains("pire-browser tap"));
        assert!(skill.content.contains("pire-browser swipe up"));
        assert!(skill.content.contains("pire-browser window new"));
        assert!(skill.content.contains("pire-browser open --init-script"));
        assert!(skill.content.contains("pire-browser addinitscript"));
        assert!(skill.content.contains("pire-browser removeinitscript"));
        assert!(skill.content.contains("pire-browser setcontent"));
        assert!(skill.content.contains("pire-browser install"));
        assert!(skill.content.contains("pire-browser install --with-deps"));
        assert!(skill.content.contains("PIRE_BROWSER_FIREFOX_PATH"));
        assert!(skill.content.contains("/Applications/Firefox.app"));
        assert!(skill.content.contains("pire-browser skills cat core"));
        assert!(skill.content.contains("pire-browser skills get core"));
        assert!(skill.content.contains("pire-browser skills get dogfood"));
        assert!(skill.content.contains("pire-browser skills get --all"));
        assert!(skill.content.contains("pire-browser skills path core"));
        assert!(skill.content.contains("hideScrollbars"));
        assert!(skill.content.contains("PIRE_BROWSER_HIDE_SCROLLBARS"));
        assert!(skill.content.contains("AGENT_BROWSER_HIDE_SCROLLBARS"));
        assert!(skill
            .content
            .contains("Do not inspect installed source code"));
        assert!(!skill.content.contains("\r"));
    }

    #[test]
    fn unknown_skill_returns_none() {
        assert!(skill_content("missing").is_none());
    }

    #[test]
    fn dogfood_skill_content_is_embedded_and_normalized() {
        let skill = skill_content("dogfood").unwrap();
        assert!(skill.content.starts_with("---\nname: dogfood\n"));
        assert!(skill.content.contains("pire-browser skills get core"));
        assert!(skill.content.contains("--session-name dogfood"));
        assert!(skill
            .content
            .contains("record start dogfood-artifacts/recordings"));
        assert!(skill.content.contains("not native WebM video"));
        assert!(!skill.content.contains("\r"));
    }

    #[test]
    fn normalizes_windows_and_lone_cr_line_endings() {
        assert_eq!(normalize_skill_text("a\r\nb\rc\n"), "a\nb\nc\n");
    }

    #[test]
    fn reads_skills_from_override_directory() {
        let root = tempfile::tempdir().unwrap();
        let skill_dir = root.path().join("custom");
        fs::create_dir_all(&skill_dir).unwrap();
        fs::write(
            skill_dir.join("SKILL.md"),
            "---\nname: custom\ndescription: Custom test skill.\n---\n\n# Custom\n",
        )
        .unwrap();

        let skills = list_skills_from_dir(root.path());
        assert_eq!(
            skills,
            vec![SkillSummary {
                name: "custom".to_string(),
                description: "Custom test skill.".to_string()
            }]
        );
        let content = skill_content_from_dir(root.path(), "custom").unwrap();
        assert_eq!(content.name, "custom");
        assert!(content.content.contains("# Custom"));
        let path = skill_path_from_dir(root.path(), "custom").unwrap();
        assert_eq!(path.source, "filesystem");
        assert_eq!(
            path.path,
            root.path().join("custom").to_string_lossy().to_string()
        );
    }

    #[test]
    fn override_directory_ignores_malformed_and_path_like_names() {
        let root = tempfile::tempdir().unwrap();
        fs::create_dir_all(root.path().join("bad")).unwrap();
        fs::write(
            root.path().join("bad").join("SKILL.md"),
            "# Missing frontmatter",
        )
        .unwrap();

        assert!(list_skills_from_dir(root.path()).is_empty());
        assert!(skill_content_from_dir(root.path(), "../core").is_none());
        assert!(skill_content_from_dir(root.path(), "bad").is_none());
    }

    #[test]
    fn override_directory_requires_requested_name_to_match_frontmatter() {
        let root = tempfile::tempdir().unwrap();
        let skill_dir = root.path().join("custom");
        fs::create_dir_all(&skill_dir).unwrap();
        fs::write(
            skill_dir.join("SKILL.md"),
            "---\nname: other\ndescription: Other test skill.\n---\n\n# Other\n",
        )
        .unwrap();

        assert!(skill_content_from_dir(root.path(), "custom").is_none());
    }
}
